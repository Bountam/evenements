using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

namespace InsertechLauncher
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            try
            {
                string targetHtmlPath = null;
                string exeDir = AppDomain.CurrentDomain.BaseDirectory;

                // 1. Chercher d'abord si dist\index.html ou index.html est présent à côté de l'exécutable
                string localDist = Path.Combine(exeDir, "dist", "index.html");
                string localSameDir = Path.Combine(exeDir, "index.html");

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
                    // 2. Sinon (mode 100% autonome sur clé USB), extraire la ressource embarquée dans AppData local
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

                if (string.IsNullOrEmpty(targetHtmlPath) || !File.Exists(targetHtmlPath))
                {
                    MessageBox.Show(
                        "Impossible de localiser l'application Insertech.\nVérifiez que le fichier est intègre.",
                        "Insertech Événements",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    return;
                }

                // Convertir en URI de fichier absolu
                string fileUri = new Uri(targetHtmlPath).AbsoluteUri;

                // 3. Détecter Microsoft Edge ou Google Chrome pour un affichage en mode Application native (sans barre d'URL)
                string browserPath = FindBrowser();

                if (!string.IsNullOrEmpty(browserPath))
                {
                    string profileDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "InsertechEvenements", "Profile");
                    Directory.CreateDirectory(profileDir);

                    // Lancement en mode App (fenêtre native dédiée, aucun pare-feu ni port requis)
                    string arguments = string.Format(
                        "--app=\"{0}\" --user-data-dir=\"{1}\" --window-size=1360,860 --start-maximized --allow-file-access-from-files --no-first-run --no-default-browser-check",
                        fileUri,
                        profileDir
                    );

                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = browserPath,
                        Arguments = arguments,
                        UseShellExecute = false
                    };
                    Process.Start(psi);
                }
                else
                {
                    // Repli sur le navigateur par défaut du système
                    Process.Start(new ProcessStartInfo(fileUri) { UseShellExecute = true });
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Erreur lors du lancement de l'application :\n" + ex.Message,
                    "Insertech Événements",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }

        static string FindBrowser()
        {
            string[] possiblePaths = new string[]
            {
                // Microsoft Edge (présent par défaut sur Windows 10 & 11)
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Microsoft\Edge\Application\msedge.exe"),
                // Google Chrome
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
