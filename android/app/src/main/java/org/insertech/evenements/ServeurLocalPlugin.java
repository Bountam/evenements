package org.insertech.evenements;

import android.content.pm.PackageInfo;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;
import org.json.JSONObject;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.util.Collections;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Serveur WebSocket du réseau local (lot 5) : la tablette écoute, le PC hôte l'appelle.
 * - /decouverte : envoie la fiche publique { app, versionCode, nom, modele, session } puis ferme (jamais la clé) ;
 * - /session : transporte le texte entre le PC et la page, sans l'interpréter. L'authentification
 *   (défi et preuve HMAC) et le chiffrement AES-GCM sont faits dans la page (src/net).
 * Bibliothèque Java-WebSocket, pur Java, sans services Google.
 */
@CapacitorPlugin(name = "ServeurLocal")
public class ServeurLocalPlugin extends Plugin {

    private static final int PORT_MAX_ESSAIS = 10;
    private static final int CONNEXIONS_MAX = 8;

    private Serveur serveur;
    private volatile String nom = "Tablette";
    private volatile String session = null;
    private final Map<String, WebSocket> connexions = new ConcurrentHashMap<>();
    private final AtomicInteger compteur = new AtomicInteger();

    private class Serveur extends WebSocketServer {
        final CountDownLatch pret = new CountDownLatch(1);
        volatile Exception erreurDemarrage = null;

        Serveur(int port) {
            super(new InetSocketAddress(port));
            setReuseAddr(true);
            setConnectionLostTimeout(20);
        }

        @Override
        public void onStart() {
            pret.countDown();
        }

        @Override
        public void onOpen(WebSocket conn, ClientHandshake handshake) {
            String chemin = handshake.getResourceDescriptor();
            if (chemin != null && chemin.startsWith("/decouverte")) {
                conn.send(fiche().toString());
                conn.close(1000, "fiche");
                return;
            }
            if (chemin == null || !chemin.startsWith("/session") || connexions.size() >= CONNEXIONS_MAX) {
                conn.close(1008, "refus");
                return;
            }
            String id = "c" + compteur.incrementAndGet();
            conn.setAttachment(id);
            connexions.put(id, conn);
            JSObject evt = new JSObject();
            evt.put("id", id);
            InetSocketAddress distant = conn.getRemoteSocketAddress();
            if (distant != null && distant.getAddress() != null) evt.put("ip", distant.getAddress().getHostAddress());
            notifyListeners("connexion", evt);
        }

        @Override
        public void onMessage(WebSocket conn, String message) {
            Object id = conn.getAttachment();
            if (id == null) return;
            JSObject evt = new JSObject();
            evt.put("id", id.toString());
            evt.put("texte", message);
            notifyListeners("message", evt);
        }

        @Override
        public void onClose(WebSocket conn, int code, String reason, boolean remote) {
            Object id = conn.getAttachment();
            if (id == null) return;
            connexions.remove(id.toString());
            JSObject evt = new JSObject();
            evt.put("id", id.toString());
            notifyListeners("deconnexion", evt);
        }

        @Override
        public void onError(WebSocket conn, Exception ex) {
            if (conn == null) {
                erreurDemarrage = ex;
                pret.countDown();
            }
        }
    }

    private JSONObject fiche() {
        JSONObject f = new JSONObject();
        try {
            f.put("app", "insertech");
            f.put("versionCode", versionCode());
            f.put("nom", nom);
            f.put("modele", (Build.MANUFACTURER + " " + Build.MODEL).trim());
            f.put("session", session == null ? JSONObject.NULL : session);
        } catch (Exception ignore) {
            // Champs simples : ne peut pas échouer
        }
        return f;
    }

    private long versionCode() {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
        } catch (Exception e) {
            return 0;
        }
    }

    // Adresse IPv4 du Wi-Fi (interface wlan de préférence), affichée sur l'écran d'attente
    private static String adresseWifi() {
        String repli = null;
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (!(a instanceof Inet4Address) || a.isLoopbackAddress() || !a.isSiteLocalAddress()) continue;
                    if (ni.getName().startsWith("wlan")) return a.getHostAddress();
                    if (repli == null) repli = a.getHostAddress();
                }
            }
        } catch (Exception ignore) {
            // Pas de réseau
        }
        return repli;
    }

    private void arreterServeur() {
        Serveur s = serveur;
        serveur = null;
        connexions.clear();
        if (s != null) {
            try {
                s.stop(500);
            } catch (Exception ignore) {
                // Déjà arrêté
            }
        }
    }

    @PluginMethod
    public void demarrer(PluginCall call) {
        int portVoulu = call.getInt("port", 47630);
        nom = call.getString("nom", "Tablette");
        session = call.getString("session", null);
        arreterServeur();
        Exception derniere = null;
        for (int port = portVoulu; port < portVoulu + PORT_MAX_ESSAIS; port++) {
            Serveur s = new Serveur(port);
            s.start();
            try {
                s.pret.await(3, TimeUnit.SECONDS);
            } catch (InterruptedException ignore) {
                Thread.currentThread().interrupt();
            }
            if (s.erreurDemarrage == null) {
                serveur = s;
                JSObject ret = new JSObject();
                ret.put("port", port);
                ret.put("ip", adresseWifi());
                call.resolve(ret);
                return;
            }
            derniere = s.erreurDemarrage;
            try {
                s.stop(100);
            } catch (Exception ignore) {
                // Rien à arrêter
            }
        }
        call.reject("Aucun port libre entre " + portVoulu + " et " + (portVoulu + PORT_MAX_ESSAIS - 1)
            + (derniere != null ? " : " + derniere.getMessage() : ""));
    }

    @PluginMethod
    public void majFiche(PluginCall call) {
        nom = call.getString("nom", nom);
        session = call.getString("session", null);
        call.resolve();
    }

    @PluginMethod
    public void envoyer(PluginCall call) {
        String id = call.getString("id");
        String texte = call.getString("texte");
        WebSocket conn = id == null ? null : connexions.get(id);
        if (conn == null || !conn.isOpen() || texte == null) {
            call.reject("Connexion fermée");
            return;
        }
        try {
            conn.send(texte);
            call.resolve();
        } catch (Exception e) {
            call.reject("Envoi impossible : " + e.getMessage());
        }
    }

    @PluginMethod
    public void fermer(PluginCall call) {
        String id = call.getString("id");
        WebSocket conn = id == null ? null : connexions.remove(id);
        if (conn != null) conn.close(1000, "fin");
        call.resolve();
    }

    @PluginMethod
    public void arreter(PluginCall call) {
        arreterServeur();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        arreterServeur();
    }
}
