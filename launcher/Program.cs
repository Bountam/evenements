using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;

namespace InsertechEvenements
{
    class Program
    {
        [STAThread]
        static void Main()
        {
            try
            {
                string targetHtmlPath = null;
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;

                string localDist = Path.Combine(baseDir, "dist", "index.html");
                string localSameDir = Path.Combine(baseDir, "index.html");

                if (File.Exists(localDist))
                {
                    targetHtmlPath = localDist;
                }
                else if (File.Exists(localSameDir))
                {
                    targetHtmlPath = localSameDir;
                }
                else
                {
                    string parentDist = Path.Combine(baseDir, "..", "dist", "index.html");
                    if (File.Exists(parentDist))
                    {
                        targetHtmlPath = Path.GetFullPath(parentDist);
                    }
                }

                // Mode 100% autonome : Si aucun fichier HTML externe n'est présent, extraire la ressource embarquée
                if (string.IsNullOrEmpty(targetHtmlPath) || !File.Exists(targetHtmlPath))
                {
                    string appDataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "InsertechEvenements");
                    Directory.CreateDirectory(appDataDir);
                    string extractedPath = Path.Combine(appDataDir, "index.html");

                    var assembly = Assembly.GetExecutingAssembly();
                    using (Stream stream = assembly.GetManifestResourceStream("app_index.html"))
                    {
                        if (stream != null)
                        {
                            using (FileStream fileStream = new FileStream(extractedPath, FileMode.Create, FileAccess.Write))
                            {
                                stream.CopyTo(fileStream);
                            }
                            targetHtmlPath = extractedPath;
                        }
                    }
                }

                if (!string.IsNullOrEmpty(targetHtmlPath) && File.Exists(targetHtmlPath))
                {
                    string fileUri = new Uri(targetHtmlPath).AbsoluteUri;
                    string browserPath = FindBrowser();

                    if (!string.IsNullOrEmpty(browserPath))
                    {
                        string profileDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "InsertechEvenements", "Profile");
                        Directory.CreateDirectory(profileDir);

                        // Mode application autonome (sans onglets ni barre d'URL, zéro port réseau, zéro invite pare-feu)
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
            }
            catch
            {
                // Fallback silencieux
            }
        }

        static string FindBrowser()
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
    }
}
