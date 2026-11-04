package org.insertech.evenements;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.net.Uri;
import android.provider.Settings;
import android.util.Base64;
import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * Verrouillage de la tablette en mode kiosque (lot 4) :
 * - pleinEcran : cache la barre d'état et la barre de navigation (un glissement les montre un instant) ;
 * - epingler / desepingler : épinglage d'écran Android (startLockTask), Retour et Accueil ne sortent plus ;
 * - quitter : ferme l'application.
 * Mise à jour envoyée par le PC hôte (lot 8) :
 * - ouvrirFichierMaj / ecrireMorceau : l'APK arrive par morceaux de 64 Ko dans le cache de l'appli ;
 * - verifierMaj : SHA-256 annoncé, même paquet, version plus récente, même certificat de signature ;
 * - installerMaj : PackageInstaller (Android demande confirmation), ou réglage « sources inconnues ».
 * Aucune dépendance aux services Google ni au Play Store.
 */
@CapacitorPlugin(name = "InsertechNatif")
public class InsertechNatifPlugin extends Plugin {

    @PluginMethod
    public void pleinEcran(PluginCall call) {
        final boolean actif = Boolean.TRUE.equals(call.getBoolean("actif", true));
        final Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            Window window = activity.getWindow();
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
            if (actif) {
                controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                controller.hide(WindowInsetsCompat.Type.systemBars());
            } else {
                controller.show(WindowInsetsCompat.Type.systemBars());
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void epingler(PluginCall call) {
        final Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            try {
                if (!estEpinglee()) activity.startLockTask();
                call.resolve();
            } catch (Exception e) {
                call.reject("Épinglage impossible : " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void desepingler(PluginCall call) {
        final Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            try {
                if (estEpinglee()) activity.stopLockTask();
                call.resolve();
            } catch (Exception e) {
                call.reject("Désépinglage impossible : " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void etat(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("epinglee", estEpinglee());
        call.resolve(ret);
    }

    @PluginMethod
    public void quitter(PluginCall call) {
        call.resolve();
        getActivity().runOnUiThread(() -> getActivity().finishAndRemoveTask());
    }

    // --- Mise à jour envoyée par le PC hôte ---

    private static final int TAILLE_MORCEAU = 64 * 1024;
    private File fichierMaj = null;
    private long tailleMaj = 0;
    private boolean majVerifiee = false;

    private File dossierMaj() {
        File d = new File(getContext().getCacheDir(), "maj");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    @PluginMethod
    public void ouvrirFichierMaj(PluginCall call) {
        String sha = call.getString("sha256", "");
        Long taille = call.getLong("taille");
        if (sha == null || !sha.matches("[0-9a-f]{64}") || taille == null || taille <= 0) {
            call.reject("Proposition invalide");
            return;
        }
        File f = new File(dossierMaj(), sha + ".apk");
        // Un seul fichier en cours : les restes d'une autre version sont effacés
        File[] autres = dossierMaj().listFiles();
        if (autres != null) for (File a : autres) if (!a.equals(f)) a.delete();
        long deja = f.exists() ? f.length() : 0;
        if (deja > taille || (deja % TAILLE_MORCEAU != 0 && deja != taille)) {
            f.delete();
            deja = 0;
        }
        try {
            if (!f.exists()) f.createNewFile();
        } catch (Exception e) {
            call.reject("Fichier de mise à jour impossible : " + e.getMessage());
            return;
        }
        fichierMaj = f;
        tailleMaj = taille;
        majVerifiee = false;
        JSObject r = new JSObject();
        r.put("octets", deja);
        call.resolve(r);
    }

    @PluginMethod
    public void ecrireMorceau(PluginCall call) {
        Integer index = call.getInt("index");
        String donnees = call.getString("donnees");
        if (fichierMaj == null || index == null || donnees == null) {
            call.reject("Aucune mise à jour en cours");
            return;
        }
        JSObject r = new JSObject();
        if (fichierMaj.length() % TAILLE_MORCEAU != 0) {
            // Dernier morceau déjà écrit ou écriture interrompue : on repart de zéro
            try {
                new FileOutputStream(fichierMaj, false).close();
            } catch (Exception ignore) {
                // Le prochain essai échouera clairement
            }
        }
        long attendu = fichierMaj.length() / TAILLE_MORCEAU;
        if (index != attendu) {
            // Morceau hors ordre : refusé, le PC renvoie celui qui manque
            r.put("attendu", attendu);
            call.resolve(r);
            return;
        }
        try {
            byte[] octets = Base64.decode(donnees, Base64.DEFAULT);
            if (fichierMaj.length() + octets.length > tailleMaj) {
                call.reject("Mise à jour plus grande qu'annoncé");
                return;
            }
            try (OutputStream out = new FileOutputStream(fichierMaj, true)) {
                out.write(octets);
            }
            call.resolve(r); // pas de champ « attendu » : morceau accepté
        } catch (Exception e) {
            call.reject("Écriture impossible : " + e.getMessage());
        }
    }

    @PluginMethod
    public void verifierMaj(PluginCall call) {
        String sha = call.getString("sha256", "");
        Long versionCode = call.getLong("versionCode");
        JSObject r = new JSObject();
        String refus = verifier(sha, versionCode == null ? 0 : versionCode);
        majVerifiee = refus == null;
        if (refus != null && fichierMaj != null) {
            fichierMaj.delete();
            fichierMaj = null;
        }
        r.put("ok", refus == null);
        if (refus != null) r.put("raison", refus);
        call.resolve(r);
    }

    private String verifier(String sha, long versionCodeAnnonce) {
        if (fichierMaj == null || !fichierMaj.exists()) return "Aucun APK reçu.";
        if (fichierMaj.length() != tailleMaj) return "APK incomplet.";
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            try (InputStream in = new FileInputStream(fichierMaj)) {
                byte[] tampon = new byte[64 * 1024];
                int n;
                while ((n = in.read(tampon)) > 0) md.update(tampon, 0, n);
            }
            StringBuilder hex = new StringBuilder();
            for (byte b : md.digest()) hex.append(String.format("%02x", b));
            if (!hex.toString().equals(sha)) return "APK modifié en route : son empreinte SHA-256 ne correspond pas.";

            PackageManager pm = getContext().getPackageManager();
            String paquet = getContext().getPackageName();
            PackageInfo recu = pm.getPackageArchiveInfo(fichierMaj.getAbsolutePath(), PackageManager.GET_SIGNING_CERTIFICATES);
            if (recu == null) return "Ce fichier n'est pas un APK valide.";
            if (!paquet.equals(recu.packageName)) return "Cet APK est une autre application (" + recu.packageName + ").";
            PackageInfo installe = pm.getPackageInfo(paquet, PackageManager.GET_SIGNING_CERTIFICATES);
            if (recu.getLongVersionCode() <= installe.getLongVersionCode()) return "Cet APK n'est pas plus récent que l'appli installée.";
            if (versionCodeAnnonce > 0 && recu.getLongVersionCode() != versionCodeAnnonce) {
                return "Version de l'APK (" + recu.getLongVersionCode() + ") différente de celle annoncée par le PC (" + versionCodeAnnonce + ").";
            }
            Set<Signature> signeRecu = signataires(recu.signingInfo);
            Set<Signature> signeInstalle = signataires(installe.signingInfo);
            if (signeRecu.isEmpty() || !signeRecu.equals(signeInstalle)) {
                return "APK signé avec une autre clé que l'appli installée : installation refusée.";
            }
            return null;
        } catch (Exception e) {
            return "Vérification impossible : " + e.getMessage();
        }
    }

    private static Set<Signature> signataires(SigningInfo info) {
        Set<Signature> set = new HashSet<>();
        if (info == null) return set;
        Signature[] liste = info.hasMultipleSigners() ? info.getApkContentsSigners() : info.getSigningCertificateHistory();
        if (liste != null) set.addAll(Arrays.asList(liste));
        return set;
    }

    @PluginMethod
    public void installerMaj(PluginCall call) {
        if (fichierMaj == null || !majVerifiee) {
            call.reject("APK non vérifié");
            return;
        }
        Context ctx = getContext();
        PackageManager pm = ctx.getPackageManager();
        JSObject r = new JSObject();
        if (!pm.canRequestPackageInstalls()) {
            // Une seule fois par tablette : autoriser Insertech à installer des applis
            Intent reglage = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName()));
            reglage.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(reglage);
            r.put("etat", "autorisation");
            call.resolve(r);
            return;
        }
        try {
            PackageInstaller installer = pm.getPackageInstaller();
            PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            params.setAppPackageName(ctx.getPackageName());
            params.setSize(fichierMaj.length());
            int id = installer.createSession(params);
            try (PackageInstaller.Session session = installer.openSession(id)) {
                try (InputStream in = new FileInputStream(fichierMaj); OutputStream out = session.openWrite("insertech.apk", 0, fichierMaj.length())) {
                    byte[] tampon = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(tampon)) > 0) out.write(tampon, 0, n);
                    session.fsync(out);
                }
                Intent retour = new Intent(ctx, InstallResultReceiver.class);
                PendingIntent pi = PendingIntent.getBroadcast(ctx, id, retour, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
                session.commit(pi.getIntentSender());
            }
            r.put("etat", "confirmation");
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Installation impossible : " + e.getMessage());
        }
    }

    private boolean estEpinglee() {
        ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        if (am == null) return false;
        // getLockTaskModeState existe depuis Android 6 ; minSdk 29
        return am.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE;
    }
}
