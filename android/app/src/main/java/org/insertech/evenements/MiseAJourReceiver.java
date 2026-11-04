package org.insertech.evenements;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Après une mise à jour (MY_PACKAGE_REPLACED) : rouvrir l'appli pour que la tablette se remette à attendre
 * le PC hôte. Android peut bloquer ce démarrage en arrière-plan ; il suffit alors de toucher l'icône.
 */
public class MiseAJourReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())) return;
        try {
            Intent ouvrir = new Intent(context, MainActivity.class);
            ouvrir.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(ouvrir);
        } catch (Exception e) {
            Log.i("InsertechMaj", "Réouverture après mise à jour refusée : " + e.getMessage());
        }
    }
}
