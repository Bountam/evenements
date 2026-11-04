package org.insertech.evenements;

import android.app.Activity;
import android.app.ActivityManager;
import android.content.Context;
import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Verrouillage de la tablette en mode kiosque (lot 4) :
 * - pleinEcran : cache la barre d'état et la barre de navigation (un glissement les montre un instant) ;
 * - epingler / desepingler : épinglage d'écran Android (startLockTask), Retour et Accueil ne sortent plus ;
 * - quitter : ferme l'application.
 * Aucune dépendance aux services Google.
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

    private boolean estEpinglee() {
        ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        if (am == null) return false;
        // getLockTaskModeState existe depuis Android 6 ; minSdk 29
        return am.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE;
    }
}
