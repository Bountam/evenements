import { isAndroidApp } from '../native/android';
import { showToast } from '../components/shared/Toast';

// Enregistre un fichier produit par l'application (export Excel, CSV, sauvegarde JSON…).
// - Navigateur (PC, web) : téléchargement classique par lien blob: + a.download, comme avant.
// - Application Android : la WebView ne sait pas télécharger un blob:, on écrit donc le fichier dans
//   Documents/Insertech avec le plugin Filesystem, puis on propose « Partager » (courriel, clé USB…).

export type SaveFileResult = 'enregistre' | 'erreur';

export const ANDROID_EXPORT_FOLDER = 'Insertech';
// Le passage en base64 double la mémoire utilisée : au-delà, la tablette risque de manquer de mémoire
export const ANDROID_MAX_EXPORT_BYTES = 30 * 1024 * 1024;

function downloadInBrowser(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      // « data:<type>;base64,<données> » : ne garder que les données
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Noms de fichier sûrs pour Android : pas de séparateur de dossier ni de caractère réservé
export function safeFileName(fileName: string): string {
  const cleaned = fileName.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim();
  return cleaned || 'export';
}

async function saveOnAndroid(fileName: string, blob: Blob): Promise<SaveFileResult> {
  if (blob.size > ANDROID_MAX_EXPORT_BYTES) {
    showToast("Fichier trop volumineux pour la tablette (plus de 30 Mo) : exportez-le depuis le PC.", 'error');
    return 'erreur';
  }
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const name = safeFileName(fileName);
  const path = `${ANDROID_EXPORT_FOLDER}/${name}`;
  const data = await blobToBase64(blob);
  // Android 10 : le plugin demande lui-même la permission d'écrire dans Documents au premier export
  const written = await Filesystem.writeFile({ path, data, directory: Directory.Documents, recursive: true });
  showToast(`Enregistré dans Documents/${ANDROID_EXPORT_FOLDER} : ${name}`, 'success', {
    label: 'Partager',
    onClick: () => {
      void shareSavedFile(written.uri, name);
    }
  });
  return 'enregistre';
}

async function shareSavedFile(uri: string, name: string) {
  try {
    const { Share } = await import('@capacitor/share');
    await Share.share({ title: name, files: [uri], dialogTitle: 'Partager le fichier' });
  } catch (e) {
    // Fermer la feuille de partage sans choisir rejette aussi la promesse : rien à signaler
    console.warn('Partage annulé ou impossible :', e);
  }
}

/**
 * Enregistre `blob` sous `fileName`. Sur Android, affiche lui-même le message de réussite (avec
 * « Partager ») ou d'erreur ; sur le web, c'est l'appelant qui garde son message habituel.
 */
export async function saveFile(fileName: string, blob: Blob): Promise<SaveFileResult> {
  if (!isAndroidApp()) {
    downloadInBrowser(fileName, blob);
    return 'enregistre';
  }
  try {
    return await saveOnAndroid(fileName, blob);
  } catch (e) {
    console.error("Échec de l'enregistrement du fichier :", e);
    showToast("Impossible d'enregistrer le fichier sur la tablette. Vérifiez l'autorisation d'accès aux fichiers.", 'error');
    return 'erreur';
  }
}
