using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace InsertechEvenements
{
    class Program
    {
        [STAThread]
        static void Main()
        {
            try
            {
                bool isLinux = RuntimeInformation.IsOSPlatform(OSPlatform.Linux);
                string appDataDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "InsertechEvenements"
                );
                Directory.CreateDirectory(appDataDir);

                // Sur Linux (Debian/Ubuntu/Mint), extraire l'icône et enregistrer l'entrée Freedesktop (.desktop)
                if (isLinux)
                {
                    SetupLinuxDesktopIntegration(appDataDir);
                }

                string targetHtmlPath = ResolveHtmlPath(appDataDir);

                if (!string.IsNullOrEmpty(targetHtmlPath) && File.Exists(targetHtmlPath))
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

                    string fileUri = new Uri(targetHtmlPath).AbsoluteUri + storageQuery;
                    string profileDir = Path.Combine(appDataDir, "Profile");
                    Directory.CreateDirectory(profileDir);

                    Process browser = isLinux ? LaunchOnLinux(fileUri, profileDir) : LaunchOnWindows(fileUri, profileDir);

                    if (companion != null)
                    {
                        KeepCompanionAlive(companion, browser);
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

        // La page interroge la sauvegarde toutes les 30 s : elle reste active tant qu'une fenêtre est ouverte,
        // puis s'arrête 2 minutes après la fermeture du navigateur
        static void KeepCompanionAlive(StorageCompanion companion, Process browser)
        {
            while (true)
            {
                Thread.Sleep(5000);
                bool browserGone;
                try { browserGone = browser == null || browser.HasExited; }
                catch { browserGone = true; }
                if (browserGone && companion.IdleFor > TimeSpan.FromMinutes(2)) return;
            }
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
            }
            catch
            {
                // Ignorer si le fichier est déjà verrouillé par une autre instance
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
