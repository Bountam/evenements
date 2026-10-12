using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;

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
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
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

                string targetHtmlPath = ResolveHtmlPath(baseDir, appDataDir);

                if (!string.IsNullOrEmpty(targetHtmlPath) && File.Exists(targetHtmlPath))
                {
                    string fileUri = new Uri(targetHtmlPath).AbsoluteUri;
                    string profileDir = Path.Combine(appDataDir, "Profile");
                    Directory.CreateDirectory(profileDir);

                    if (isLinux)
                    {
                        LaunchOnLinux(fileUri, profileDir);
                    }
                    else
                    {
                        LaunchOnWindows(fileUri, profileDir);
                    }
                }
            }
            catch
            {
                // Repli silencieux pour éviter tout crash bloquant
            }
        }

        static string ResolveHtmlPath(string baseDir, string appDataDir)
        {
            string localDist = Path.Combine(baseDir, "dist", "index.html");
            string localSameDir = Path.Combine(baseDir, "index.html");

            if (File.Exists(localDist))
            {
                return localDist;
            }
            if (File.Exists(localSameDir))
            {
                return localSameDir;
            }

            string parentDist = Path.Combine(baseDir, "..", "dist", "index.html");
            if (File.Exists(parentDist))
            {
                return Path.GetFullPath(parentDist);
            }

            // Mode 100% autonome : extraire la ressource HTML embarquée dans le dossier utilisateur
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

        static void LaunchOnWindows(string fileUri, string profileDir)
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
                Process.Start(psi);
            }
            else
            {
                Process.Start(new ProcessStartInfo(fileUri) { UseShellExecute = true });
            }
        }

        static void LaunchOnLinux(string fileUri, string profileDir)
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
                Process.Start(psi);
                return;
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
                Process.Start(psi);
                return;
            }

            // 3. Repli universel Freedesktop (xdg-open)
            if (File.Exists("/usr/bin/xdg-open"))
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "/usr/bin/xdg-open",
                    Arguments = "\"" + fileUri + "\"",
                    UseShellExecute = false
                });
            }
            else
            {
                Process.Start(new ProcessStartInfo(fileUri) { UseShellExecute = true });
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
