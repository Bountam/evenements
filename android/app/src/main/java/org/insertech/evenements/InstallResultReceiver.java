package org.insertech.evenements;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.util.Log;

/**
 * Résultat de l'installation lancée par InsertechNatifPlugin.installerMaj (lot 8).
 * STATUS_PENDING_USER_ACTION : Android demande confirmation ; on ouvre son écran « Mettre à jour ».
 * Les autres statuts sont seulement notés : en cas de succès l'appli est remplacée et redémarre
 * (voir MiseAJourReceiver), en cas d'échec ou d'annulation la tablette garde sa version.
 */
public class InstallResultReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        int statut = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (statut == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirmation = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirmation != null) {
                confirmation.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(confirmation);
            }
            return;
        }
        Log.i("InsertechMaj", "Installation : statut " + statut + " " + intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE));
    }
}
