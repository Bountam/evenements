using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace InsertechEvenements
{
    class Program
    {
        const string AllowedDownloadPrefix = "https://github.com/Bountam/evenements/releases/download/";

        static readonly ManualResetEventSlim exitSignal = new ManualResetEventSlim(false);
        static readonly object updateLock = new object();
        static readonly HttpClient updateHttpClient = CreateUpdateHttpClient();

        static string updateState = "idle";
        static string updateVersion = null;
        static long updateDownloadedBytes = 0;
        static long updateTotalBytes = 0;
        static int updatePercent = 0;
        static string updateError = null;
        static string updateMessage = null;

        static HttpClient CreateUpdateHttpClient()
        {
            var client = new HttpClient { Timeout = TimeSpan.FromMinutes(10) };
            client.DefaultRequestHeaders.UserAgent.ParseAdd("InsertechEvenements-Updater/1.0");
            return client;
        }

        [STAThread]
        static void Main(string[] args)
        {
            try
            {
                bool isLinux = RuntimeInformation.IsOSPlatform(OSPlatform.Linux);
                string customAppData = Environment.GetEnvironmentVariable("INSERTECH_APPDATA_DIR");
                string appDataDir = !string.IsNullOrEmpty(customAppData)
                    ? Path.GetFullPath(customAppData)
                    : Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                        "InsertechEvenements"
                    );
                Directory.CreateDirectory(appDataDir);

                // Sur Linux (Debian/Ubuntu/Mint), extraire l'icône et enregistrer l'entrée Freedesktop (.desktop)
                if (isLinux && string.IsNullOrEmpty(customAppData))
                {
                    SetupLinuxDesktopIntegration(appDataDir);
                }

                string completedUpdateVersion = ReadCompletedUpdateVersion(args, appDataDir);
                string targetHtmlPath = ResolveHtmlPath(appDataDir);
                bool headlessCompanion = Environment.GetEnvironmentVariable("INSERTECH_HEADLESS_COMPANION") == "1";

                if (headlessCompanion || (!string.IsNullOrEmpty(targetHtmlPath) && File.Exists(targetHtmlPath)))
                {
                    // Sauvegarde persistante SQLite : réutiliser celle d'une fenêtre déjà ouverte, sinon la démarrer
                    StorageCompanion companion = null;
                    string storageQuery = ReuseRunningCompanion(appDataDir);
                    if (storageQuery == null)
                    {
                        try
                        {
                            companion = new StorageCompanion(appDataDir);
                            companion.Start();
                            File.WriteAllText(CompanionInfoPath(appDataDir), companion.Port + "\n" + companion.Token);
                            storageQuery = $"?stockage={companion.Port}&cle={companion.Token}";
                        }
                        catch
                        {
                            // Sans SQLite, l'application fonctionne comme avant (base du navigateur seulement)
                            companion?.Dispose();
                            companion = null;
                            storageQuery = "";
                        }
                    }

                    if (!string.IsNullOrEmpty(completedUpdateVersion))
                    {
                        string sep = string.IsNullOrEmpty(storageQuery) ? "?" : "&";
                        storageQuery += $"{sep}maj={Uri.EscapeDataString(completedUpdateVersion)}";
                    }

                    Process browser = null;
                    if (!headlessCompanion)
                    {
                        string fileUri = new Uri(targetHtmlPath).AbsoluteUri + storageQuery;
                        string profileDir = Path.Combine(appDataDir, "Profile");
                        Directory.CreateDirectory(profileDir);

                        browser = isLinux ? LaunchOnLinux(fileUri, profileDir) : LaunchOnWindows(fileUri, profileDir);
                    }

                    if (companion != null)
                    {
                        KeepCompanionAlive(companion, browser, headlessCompanion);
                        try { File.Delete(CompanionInfoPath(appDataDir)); } catch { }
                        companion.Dispose();
                    }
                }
            }
            catch
            {
                // Repli silencieux pour éviter tout crash bloquant
            }
        }

        static string CompanionInfoPath(string appDataDir) => Path.Combine(appDataDir, "stockage.txt");
        static string CompletedUpdateFilePath(string appDataDir) => Path.Combine(appDataDir, "maj-terminee.txt");

        static string ReadCompletedUpdateVersion(string[] args, string appDataDir)
        {
            string version = null;
            if (args != null)
            {
                foreach (var arg in args)
                {
                    if (arg != null && arg.StartsWith("--maj-terminee=", StringComparison.Ordinal))
                    {
                        string candidate = arg.Substring("--maj-terminee=".Length).Trim();
                        if (IsValidSemver(candidate)) version = candidate;
                    }
                }
            }
            string markerPath = CompletedUpdateFilePath(appDataDir);
            try
            {
                if (File.Exists(markerPath))
                {
                    string marker = File.ReadAllText(markerPath).Trim();
                    File.Delete(markerPath);
                    if (string.IsNullOrEmpty(version) && IsValidSemver(marker))
                        version = marker;
                }
            }
            catch { }
            return version;
        }

        // La page interroge la sauvegarde toutes les 30 s : elle reste active tant qu'une fenêtre est ouverte,
        // puis s'arrête 2 minutes après la fermeture du navigateur (ou immédiatement lors d'une mise à jour)
        static void KeepCompanionAlive(StorageCompanion companion, Process browser, bool headlessCompanion)
        {
            while (!exitSignal.IsSet)
            {
                if (exitSignal.Wait(5000)) return;
                if (headlessCompanion)
                {
                    if (companion.IdleFor > TimeSpan.FromMinutes(2)) return;
                    continue;
                }
                bool browserGone;
                try { browserGone = browser == null || browser.HasExited; }
                catch { browserGone = true; }
                if (browserGone && companion.IdleFor > TimeSpan.FromMinutes(2)) return;
            }
        }

        public static bool CanUpdateOnThisPlatform()
        {
            if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("INSERTECH_TEST_UPDATE_PREFIX")))
                return true;
            return RuntimeInformation.IsOSPlatform(OSPlatform.Windows);
        }

        public static bool IsAllowedDownloadUrl(string url)
        {
            if (string.IsNullOrWhiteSpace(url)) return false;
            string testPrefix = Environment.GetEnvironmentVariable("INSERTECH_TEST_UPDATE_PREFIX");
            if (!string.IsNullOrEmpty(testPrefix) && url.StartsWith(testPrefix, StringComparison.Ordinal))
                return true;
            return url.StartsWith(AllowedDownloadPrefix, StringComparison.Ordinal);
        }

        static bool IsValidSemver(string version)
        {
            if (string.IsNullOrWhiteSpace(version)) return false;
            var parts = version.Split('.');
            if (parts.Length != 3) return false;
            foreach (var part in parts)
            {
                if (part.Length == 0 || part.Length > 6) return false;
                for (int i = 0; i < part.Length; i++)
                {
                    if (part[i] < '0' || part[i] > '9') return false;
                }
            }
            return true;
        }

        public static string GetUpdateStatusJson()
        {
            lock (updateLock)
            {
                string supported = CanUpdateOnThisPlatform() ? "true" : "false";
                string verJson = updateVersion == null ? "null" : JsonSerializer.Serialize(updateVersion, AppJson.Default.String);
                string errJson = updateError == null ? "null" : JsonSerializer.Serialize(updateError, AppJson.Default.String);
                string msgJson = updateMessage == null ? "null" : JsonSerializer.Serialize(updateMessage, AppJson.Default.String);
                string stateJson = JsonSerializer.Serialize(updateState, AppJson.Default.String);
                return
                    "{\"ok\":true,\"supported\":" + supported +
                    ",\"state\":" + stateJson +
                    ",\"version\":" + verJson +
                    ",\"downloadedBytes\":" + updateDownloadedBytes +
                    ",\"totalBytes\":" + updateTotalBytes +
                    ",\"percent\":" + updatePercent +
                    ",\"error\":" + errJson +
                    ",\"message\":" + msgJson + "}";
            }
        }

        static void SetUpdateError(string code, string message)
        {
            lock (updateLock)
            {
                updateState = "error";
                updateError = code;
                updateMessage = message;
            }
        }

        public static (int, string) StartUpdateFromHttp(string appDataDir, StorageCompanion companion, byte[] body)
        {
            if (!CanUpdateOnThisPlatform())
            {
                SetUpdateError("plateforme", "La mise à jour en un clic n'est disponible que sur Windows.");
                return (400, GetUpdateStatusJson());
            }

            string version = null;
            string installerUrl = null;
            string sha256SumsUrl = null;
            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;
                if (root.TryGetProperty("version", out var v) && v.ValueKind == JsonValueKind.String)
                    version = v.GetString()?.Trim();
                if (root.TryGetProperty("installerUrl", out var iu) && iu.ValueKind == JsonValueKind.String)
                    installerUrl = iu.GetString()?.Trim();
                if (root.TryGetProperty("sha256SumsUrl", out var su) && su.ValueKind == JsonValueKind.String)
                    sha256SumsUrl = su.GetString()?.Trim();
            }
            catch
            {
                SetUpdateError("format", "Requête de mise à jour invalide.");
                return (400, GetUpdateStatusJson());
            }

            if (!IsValidSemver(version))
            {
                SetUpdateError("version", "Numéro de version invalide.");
                return (400, GetUpdateStatusJson());
            }

            string expectedFileName = $"InsertechEvenements-Setup-{version}.exe";
            if (!IsAllowedDownloadUrl(installerUrl) ||
                !IsAllowedDownloadUrl(sha256SumsUrl) ||
                !installerUrl.EndsWith("/" + expectedFileName, StringComparison.Ordinal) ||
                !sha256SumsUrl.EndsWith("/SHA256SUMS.txt", StringComparison.Ordinal))
            {
                SetUpdateError("origine", "Adresse de téléchargement refusée (origine non autorisée).");
                return (400, GetUpdateStatusJson());
            }

            lock (updateLock)
            {
                if (updateState == "downloading" || updateState == "verifying" || updateState == "installing")
                {
                    return (409, GetUpdateStatusJson());
                }
                updateState = "downloading";
                updateVersion = version;
                updateDownloadedBytes = 0;
                updateTotalBytes = 0;
                updatePercent = 0;
                updateError = null;
                updateMessage = null;
            }

            _ = Task.Run(() => RunUpdateAsync(appDataDir, companion, version, installerUrl, sha256SumsUrl));
            return (202, GetUpdateStatusJson());
        }

        static async Task RunUpdateAsync(string appDataDir, StorageCompanion companion, string version, string installerUrl, string sha256SumsUrl)
        {
            string updatesDir = Path.Combine(appDataDir, "mises-a-jour");
            Directory.CreateDirectory(updatesDir);
            string fileName = $"InsertechEvenements-Setup-{version}.exe";
            string partPath = Path.Combine(updatesDir, fileName + ".part");
            string finalPath = Path.Combine(updatesDir, fileName);
            TryDeleteFile(partPath);

            long? expectedBytes = null;
            long totalRead = 0;
            try
            {
                using var response = await updateHttpClient.GetAsync(installerUrl, HttpCompletionOption.ResponseHeadersRead);
                if (!response.IsSuccessStatusCode)
                {
                    SetUpdateError("telechargement", $"Échec du téléchargement de l'installeur (HTTP {(int)response.StatusCode}).");
                    return;
                }
                expectedBytes = response.Content.Headers.ContentLength;
                lock (updateLock)
                {
                    updateTotalBytes = expectedBytes ?? 0;
                }

                using (var netStream = await response.Content.ReadAsStreamAsync())
                using (var fileStream = new FileStream(partPath, FileMode.Create, FileAccess.Write, FileShare.None))
                {
                    byte[] buf = new byte[32768];
                    while (true)
                    {
                        int n = await netStream.ReadAsync(buf, 0, buf.Length);
                        if (n <= 0) break;
                        await fileStream.WriteAsync(buf, 0, n);
                        totalRead += n;
                        companion?.TouchActivity();
                        lock (updateLock)
                        {
                            updateDownloadedBytes = totalRead;
                            if (updateTotalBytes > 0)
                            {
                                updatePercent = (int)Math.Clamp((totalRead * 100L) / updateTotalBytes, 0L, 99L);
                            }
                        }
                    }
                    await fileStream.FlushAsync();
                }
            }
            catch
            {
                TryDeleteFile(partPath);
                if (expectedBytes.HasValue && totalRead > 0 && totalRead < expectedBytes.Value)
                {
                    SetUpdateError("tronque", "Le téléchargement a été interrompu avant la fin (fichier tronqué).");
                }
                else
                {
                    SetUpdateError("telechargement", "Impossible de télécharger l'installeur. Vérifiez la connexion réseau.");
                }
                return;
            }

            if (totalRead <= 0 || (expectedBytes.HasValue && totalRead != expectedBytes.Value))
            {
                TryDeleteFile(partPath);
                SetUpdateError("tronque", "Le téléchargement a été interrompu avant la fin (fichier tronqué).");
                return;
            }

            lock (updateLock)
            {
                updateState = "verifying";
                updatePercent = 99;
            }

            string sumsText;
            try
            {
                using var sumsResponse = await updateHttpClient.GetAsync(sha256SumsUrl);
                if (!sumsResponse.IsSuccessStatusCode)
                {
                    TryDeleteFile(partPath);
                    SetUpdateError("empreinte", "Impossible de télécharger SHA256SUMS.txt pour vérifier l'intégrité.");
                    return;
                }
                sumsText = await sumsResponse.Content.ReadAsStringAsync();
            }
            catch
            {
                TryDeleteFile(partPath);
                SetUpdateError("empreinte", "Impossible de récupérer SHA256SUMS.txt.");
                return;
            }

            string expectedHash = FindExpectedSha256(sumsText, fileName);
            if (string.IsNullOrEmpty(expectedHash))
            {
                TryDeleteFile(partPath);
                SetUpdateError("empreinte", $"Empreinte absente de SHA256SUMS.txt pour {fileName}.");
                return;
            }

            string actualHash;
            try
            {
                using var fs = File.OpenRead(partPath);
                using var sha = SHA256.Create();
                actualHash = Convert.ToHexString(sha.ComputeHash(fs)).ToLowerInvariant();
            }
            catch
            {
                TryDeleteFile(partPath);
                SetUpdateError("empreinte", "Impossible de calculer l'empreinte SHA-256 du fichier téléchargé.");
                return;
            }

            bool hashMatches = CryptographicOperations.FixedTimeEquals(
                Encoding.ASCII.GetBytes(actualHash),
                Encoding.ASCII.GetBytes(expectedHash)
            );
            if (!hashMatches)
            {
                TryDeleteFile(partPath);
                TryDeleteFile(finalPath);
                SetUpdateError("empreinte", "L'empreinte SHA-256 ne correspond pas à SHA256SUMS.txt. Le fichier a été supprimé.");
                return;
            }

            try
            {
                File.Move(partPath, finalPath, overwrite: true);
            }
            catch
            {
                TryDeleteFile(partPath);
                SetUpdateError("lancement", "Impossible d'enregistrer l'installeur vérifié.");
                return;
            }

            // Copie de secours de insertech.db juste avant de lancer l'installeur
            companion?.BackupBeforeUpdate();

            try
            {
                File.WriteAllText(CompletedUpdateFilePath(appDataDir), version);
            }
            catch { }

            lock (updateLock)
            {
                updateState = "installing";
                updatePercent = 100;
            }

            // Laisser le temps à la page de recevoir l'état « installing » avant de fermer le serveur
            await Task.Delay(450);

            try
            {
                string testRecordPath = Environment.GetEnvironmentVariable("INSERTECH_TEST_INSTALLER_RECORD");
                if (!string.IsNullOrEmpty(testRecordPath))
                {
                    File.WriteAllText(testRecordPath, finalPath + "\n/S /RELANCER\n" + version);
                }
                else
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = finalPath,
                        Arguments = "/S /RELANCER",
                        UseShellExecute = false
                    });
                }
            }
            catch
            {
                try { File.Delete(CompletedUpdateFilePath(appDataDir)); } catch { }
                SetUpdateError("lancement", "Impossible de démarrer l'installeur Windows.");
                return;
            }

            exitSignal.Set();
        }

        static string FindExpectedSha256(string sumsContent, string targetFileName)
        {
            if (string.IsNullOrEmpty(sumsContent)) return null;
            foreach (var rawLine in sumsContent.Split('\n'))
            {
                string line = rawLine.Trim();
                if (line.Length < 66) continue;
                int spaceIdx = line.IndexOfAny(new[] { ' ', '\t' });
                if (spaceIdx != 64) continue;
                string hash = line.Substring(0, 64);
                string name = line.Substring(spaceIdx).TrimStart(' ', '\t', '*');
                if (string.Equals(name, targetFileName, StringComparison.OrdinalIgnoreCase))
                {
                    for (int i = 0; i < 64; i++)
                    {
                        char c = hash[i];
                        bool isHex = (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
                        if (!isHex) return null;
                    }
                    return hash.ToLowerInvariant();
                }
            }
            return null;
        }

        static void TryDeleteFile(string path)
        {
            try
            {
                if (!string.IsNullOrEmpty(path) && File.Exists(path))
                    File.Delete(path);
            }
            catch { }
        }

        static string ReuseRunningCompanion(string appDataDir)
        {
            try
            {
                var lines = File.ReadAllLines(CompanionInfoPath(appDataDir));
                if (lines.Length < 2 || !int.TryParse(lines[0], out int port)) return null;
                string token = lines[1].Trim();
                using var client = new TcpClient();
                if (!client.ConnectAsync("127.0.0.1", port).Wait(1000)) return null;
                var stream = client.GetStream();
                var request = Encoding.ASCII.GetBytes($"GET /ping?cle={token} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n");
                stream.Write(request, 0, request.Length);
                stream.ReadTimeout = 2000;
                var buffer = new byte[64];
                int n = stream.Read(buffer, 0, buffer.Length);
                return Encoding.ASCII.GetString(buffer, 0, n).Contains(" 200 ") ? $"?stockage={port}&cle={token}" : null;
            }
            catch
            {
                return null;
            }
        }

        static string ResolveHtmlPath(string appDataDir)
        {
            // Mode développeur explicite uniquement : un index.html oublié à côté de l'exécutable
            // (Téléchargements, clé USB, dossier du dépôt) afficherait sinon une ancienne interface.
            string devHtml = Environment.GetEnvironmentVariable("INSERTECH_DEV_HTML");
            if (!string.IsNullOrEmpty(devHtml) && File.Exists(devHtml))
            {
                return Path.GetFullPath(devHtml);
            }

            // Toujours l'interface embarquée dans cet exécutable, réextraite à chaque lancement
            string extractedPath = Path.Combine(appDataDir, "index.html");
            ExtractEmbeddedResource("app_index.html", extractedPath);

            return File.Exists(extractedPath) ? extractedPath : null;
        }

        static void ExtractEmbeddedResource(string resourceName, string destinationPath)
        {
            for (int attempt = 0; attempt < 3; attempt++)
            {
                try
                {
                    var assembly = Assembly.GetExecutingAssembly();
                    using (Stream stream = assembly.GetManifestResourceStream(resourceName))
                    {
                        if (stream != null)
                        {
                            using (FileStream fileStream = new FileStream(destinationPath, FileMode.Create, FileAccess.Write))
                            {
                                stream.CopyTo(fileStream);
                            }
                        }
                    }
                    return;
                }
                catch
                {
                    if (attempt < 2) Thread.Sleep(150);
                }
            }
        }

        static void SetupLinuxDesktopIntegration(string appDataDir)
        {
            try
            {
                string iconPath = Path.Combine(appDataDir, "logo.png");
                ExtractEmbeddedResource("app_logo.png", iconPath);

                string exePath = Environment.ProcessPath;
                if (string.IsNullOrEmpty(exePath))
                {
                    exePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "InsertechEvenements-linux-x64");
                }

                string localShare = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string applicationsDir = Path.Combine(localShare, "applications");
                Directory.CreateDirectory(applicationsDir);

                string desktopFilePath = Path.Combine(applicationsDir, "insertech-evenements.desktop");
                string desktopContent =
                    "[Desktop Entry]\n" +
                    "Version=1.0\n" +
                    "Type=Application\n" +
                    "Name=Insertech Événements\n" +
                    "Comment=Tableau de bord événementiel hors-ligne Insertech\n" +
                    "Exec=\"" + exePath + "\"\n" +
                    "Icon=" + iconPath + "\n" +
                    "Terminal=false\n" +
                    "Categories=Office;Utility;\n" +
                    "StartupWMClass=InsertechEvenements\n";

                File.WriteAllText(desktopFilePath, desktopContent);
            }
            catch
            {
                // Non bloquant si l'environnement est sans bureau graphique standard
            }
        }

        static Process LaunchOnWindows(string fileUri, string profileDir)
        {
            string browserPath = FindWindowsChromiumBrowser();

            if (!string.IsNullOrEmpty(browserPath))
            {
                string args = string.Format(
                    "--app=\"{0}\" --user-data-dir=\"{1}\" --window-size=1360,860 --start-maximized --allow-file-access-from-files --no-first-run --no-default-browser-check",
                    fileUri,
                    profileDir
                );

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = browserPath,
                    Arguments = args,
                    UseShellExecute = false
                };
                return Process.Start(psi);
            }
            else
            {
                // Ouverture par le système : sans paramètres, une adresse file:// avec « ? » n'est pas un fichier
                return Process.Start(new ProcessStartInfo(fileUri.Split('?')[0]) { UseShellExecute = true });
            }
        }

        static Process LaunchOnLinux(string fileUri, string profileDir)
        {
            // 1. Priorité aux navigateurs Chromium (supportent le mode fenêtre native --app sans barre d'adresse)
            string chromiumBrowser = FindLinuxChromiumBrowser();
            if (!string.IsNullOrEmpty(chromiumBrowser))
            {
                string args = string.Format(
                    "--app=\"{0}\" --user-data-dir=\"{1}\" --class=InsertechEvenements --window-size=1360,860 --start-maximized --allow-file-access-from-files --no-first-run --no-default-browser-check",
                    fileUri,
                    profileDir
                );

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = chromiumBrowser,
                    Arguments = args,
                    UseShellExecute = false
                };
                return Process.Start(psi);
            }

            // 2. Navigateur par défaut sur Debian : Firefox ESR ou Firefox standard
            string firefoxBrowser = FindLinuxFirefoxBrowser();
            if (!string.IsNullOrEmpty(firefoxBrowser))
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = firefoxBrowser,
                    Arguments = "--new-window \"" + fileUri + "\"",
                    UseShellExecute = false
                };
                return Process.Start(psi);
            }

            // 3. Repli universel Freedesktop (xdg-open)
            if (File.Exists("/usr/bin/xdg-open"))
            {
                return Process.Start(new ProcessStartInfo
                {
                    FileName = "/usr/bin/xdg-open",
                    Arguments = "\"" + fileUri + "\"",
                    UseShellExecute = false
                });
            }
            else
            {
                // Ouverture par le système : sans paramètres, une adresse file:// avec « ? » n'est pas un fichier
                return Process.Start(new ProcessStartInfo(fileUri.Split('?')[0]) { UseShellExecute = true });
            }
        }

        static string FindWindowsChromiumBrowser()
        {
            string[] possiblePaths = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Google\Chrome\Application\chrome.exe")
            };

            foreach (string path in possiblePaths)
            {
                if (File.Exists(path))
                {
                    return path;
                }
            }

            return null;
        }

        static string FindLinuxChromiumBrowser()
        {
            string[] candidates = new string[]
            {
                "/usr/bin/chromium",
                "/usr/bin/chromium-browser",
                "/snap/bin/chromium",
                "/usr/bin/google-chrome",
                "/usr/bin/google-chrome-stable",
                "/usr/bin/brave-browser",
                "/usr/bin/microsoft-edge",
                "/usr/bin/microsoft-edge-stable"
            };

            foreach (string path in candidates)
            {
                if (File.Exists(path))
                {
                    return path;
                }
            }

            return null;
        }

        static string FindLinuxFirefoxBrowser()
        {
            string[] candidates = new string[]
            {
                "/usr/bin/firefox-esr",
                "/usr/bin/firefox",
                "/snap/bin/firefox"
            };

            foreach (string path in candidates)
            {
                if (File.Exists(path))
                {
                    return path;
                }
            }

            return null;
        }
    }
}
