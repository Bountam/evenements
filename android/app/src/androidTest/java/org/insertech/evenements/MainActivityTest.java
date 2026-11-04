package org.insertech.evenements;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.webkit.WebView;
import androidx.test.ext.junit.rules.ActivityScenarioRule;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Test instrumenté (émulateur Android 10 sans services Google, voir .github/workflows/android-emulateur.yml) :
 * l'application démarre, la page web se charge depuis l'APK, les plugins maison répondent et le stockage
 * SQLite garde ce qu'on lui confie.
 */
@RunWith(AndroidJUnit4.class)
public class MainActivityTest {

    @Rule
    public ActivityScenarioRule<MainActivity> regle = new ActivityScenarioRule<>(MainActivity.class);

    /** Évalue du JavaScript dans la WebView de Capacitor et renvoie le résultat (texte JSON). */
    private String evaluer(String script) throws InterruptedException {
        CountDownLatch fini = new CountDownLatch(1);
        AtomicReference<String> resultat = new AtomicReference<>();
        regle.getScenario().onActivity(activite -> {
            WebView vue = activite.getBridge().getWebView();
            vue.evaluateJavascript(script, valeur -> {
                resultat.set(valeur);
                fini.countDown();
            });
        });
        assertTrue("La WebView n'a pas répondu", fini.await(10, TimeUnit.SECONDS));
        return resultat.get();
    }

    /** Attend que le script renvoie true (la page met quelques secondes à charger sur l'émulateur). */
    private void attendre(String condition, long delaiMs) throws InterruptedException {
        long fin = System.currentTimeMillis() + delaiMs;
        String dernier = null;
        while (System.currentTimeMillis() < fin) {
            dernier = evaluer("(function(){try{return Boolean(" + condition + ")}catch(e){return false}})()");
            if ("true".equals(dernier)) return;
            Thread.sleep(500);
        }
        throw new AssertionError("Condition jamais vraie : " + condition + " (dernier résultat : " + dernier + ")");
    }

    @Test
    public void laPageSeChargeDepuisLApk() throws Exception {
        attendre("document.readyState === 'complete' && document.querySelector('#root') && document.querySelector('#root').childElementCount > 0", 60000);
        // Aucune adresse internet : la page vient des fichiers de l'APK (https://localhost de Capacitor).
        assertEquals("\"localhost\"", evaluer("location.hostname"));

        // L'interface demande Chrome 111+ (Tailwind 4). Avec un WebView plus ancien (image Android 10 jamais mise
        // à jour), index.html doit afficher quoi faire au lieu d'une page blanche ; sinon, l'appli elle-même.
        String agent = evaluer("navigator.userAgent");
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("Chrome/(\\d+)").matcher(agent);
        assertTrue("Version du WebView introuvable : " + agent, m.find());
        int version = Integer.parseInt(m.group(1));
        String message = evaluer("Boolean(document.getElementById('navigateur-trop-ancien'))");
        if (version >= 111) {
            assertEquals("WebView " + version + " : l'appli devait s'afficher", "false", message);
            attendre("document.body.innerText.length > 20", 10000);
        } else {
            assertEquals("WebView " + version + " : le message de mise à jour devait s'afficher", "true", message);
        }
    }

    @Test
    public void lesPluginsMaisonSontDisponibles() throws Exception {
        attendre("window.Capacitor && window.Capacitor.isNativePlatform()", 60000);
        assertEquals("true", evaluer("window.Capacitor.isPluginAvailable('InsertechNatif')"));
        assertEquals("true", evaluer("window.Capacitor.isPluginAvailable('ServeurLocal')"));
        assertEquals("\"android\"", evaluer("window.Capacitor.getPlatform()"));
    }

    @Test
    public void lePontDeStockageEstExpose() throws Exception {
        attendre("typeof window.InsertechStockage === 'object' && window.InsertechStockage !== null", 60000);
    }

    @Test
    public void leStockageSqliteRelitCeQuIlAEcrit() throws Exception {
        Context contexte = InstrumentationRegistry.getInstrumentation().getTargetContext();
        StorageBridge stockage = new StorageBridge(contexte);
        String corps = "{\"savedAt\":1234,\"allowEmpty\":true,\"tables\":{\"events\":[{\"id\":\"evt-test\",\"nom\":\"Essai\"}],"
                + "\"participants\":[{\"id\":\"p1\",\"eventId\":\"evt-test\",\"nom\":\"Luka\"}]}}";
        JSONObject ecrit = new JSONObject(stockage.save(corps));
        assertTrue(ecrit.optBoolean("ok"));

        String relu = stockage.load();
        assertNotNull(relu);
        JSONObject racine = new JSONObject(relu);
        assertEquals(1234, racine.getLong("savedAt"));
        JSONObject tables = racine.getJSONObject("tables");
        assertEquals("evt-test", tables.getJSONArray("events").getJSONObject(0).getString("id"));
        assertEquals("Luka", tables.getJSONArray("participants").getJSONObject(0).getString("nom"));

        // Une sauvegarde vide ne doit pas écraser un événement existant sans allowEmpty.
        JSONObject vide = new JSONObject(stockage.save("{\"savedAt\":5678,\"tables\":{\"events\":[]}}"));
        assertFalse(vide.optBoolean("ok"));
        stockage.close();
    }

    @Test
    public void leLienDuQrOuvreLApplication() {
        Context contexte = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Intent lien = new Intent(Intent.ACTION_VIEW, Uri.parse("insertech://rejoindre?code=ABC123&cle=test"));
        lien.addCategory(Intent.CATEGORY_BROWSABLE);
        List<ResolveInfo> cibles = contexte.getPackageManager().queryIntentActivities(lien, 0);
        boolean trouve = false;
        for (ResolveInfo cible : cibles) {
            if (contexte.getPackageName().equals(cible.activityInfo.packageName)) trouve = true;
        }
        assertTrue("Le lien insertech://rejoindre doit ouvrir l'application", trouve);
    }
}
