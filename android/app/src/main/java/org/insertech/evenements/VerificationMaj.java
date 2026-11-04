package org.insertech.evenements;

import java.io.InputStream;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Logique pure de la mise à jour envoyée par le PC (lot 8), sans classe Android : testée par JUnit
 * (src/test/java/.../VerificationMajTest.java) sur la JVM de la CI.
 */
public final class VerificationMaj {
    private VerificationMaj() {}

    /** Empreinte SHA-256 en hexadécimal minuscule, lue par tranches de 64 Ko. */
    public static String sha256Hex(InputStream in) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] tampon = new byte[64 * 1024];
        int n;
        while ((n = in.read(tampon)) > 0) md.update(tampon, 0, n);
        StringBuilder hex = new StringBuilder();
        for (byte b : md.digest()) hex.append(String.format("%02x", b));
        return hex.toString();
    }

    /** Vrai si les deux listes de certificats (octets encodés) sont les mêmes, et non vides. */
    public static boolean memesCertificats(List<byte[]> recus, List<byte[]> installes) {
        Set<String> a = enHex(recus);
        Set<String> b = enHex(installes);
        return !a.isEmpty() && a.equals(b);
    }

    private static Set<String> enHex(List<byte[]> certificats) {
        Set<String> set = new HashSet<>();
        if (certificats == null) return set;
        for (byte[] c : certificats) {
            if (c == null || c.length == 0) continue;
            StringBuilder hex = new StringBuilder();
            for (byte b : c) hex.append(String.format("%02x", b));
            set.add(hex.toString());
        }
        return set;
    }

    /**
     * Octets déjà reçus qu'on peut garder pour reprendre l'envoi : un nombre entier de morceaux, ou le fichier
     * complet. Tout le reste (fichier trop gros, morceau à moitié écrit) repart de zéro.
     */
    public static long octetsRepris(long deja, long taille, int tailleMorceau) {
        if (deja <= 0 || deja > taille) return 0;
        if (deja == taille || deja % tailleMorceau == 0) return deja;
        return 0;
    }

    /** Empreinte annoncée par le PC : 64 caractères hexadécimaux minuscules. */
    public static boolean empreinteValide(String sha256) {
        return sha256 != null && sha256.matches("[0-9a-f]{64}");
    }
}
