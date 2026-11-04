package org.insertech.evenements;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

/** Tests JVM (sans tablette) de la vérification des mises à jour envoyées par le PC. */
public class VerificationMajTest {

    private static final int MORCEAU = 64 * 1024;

    @Test
    public void sha256DuTexteConnu() throws Exception {
        String hex = VerificationMaj.sha256Hex(new ByteArrayInputStream("abc".getBytes(StandardCharsets.UTF_8)));
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", hex);
    }

    @Test
    public void sha256DuFichierVide() throws Exception {
        assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                VerificationMaj.sha256Hex(new ByteArrayInputStream(new byte[0])));
    }

    @Test
    public void sha256DUnFichierPlusGrosQuUnTampon() throws Exception {
        byte[] gros = new byte[MORCEAU * 3 + 17];
        Arrays.fill(gros, (byte) 'a');
        String une = VerificationMaj.sha256Hex(new ByteArrayInputStream(gros));
        String deux = VerificationMaj.sha256Hex(new ByteArrayInputStream(gros.clone()));
        assertEquals(une, deux);
        assertTrue(VerificationMaj.empreinteValide(une));
        gros[gros.length - 1] = 'b';
        assertFalse(une.equals(VerificationMaj.sha256Hex(new ByteArrayInputStream(gros))));
    }

    @Test
    public void memesCertificatsAccepteLaMemeCle() {
        List<byte[]> a = Collections.singletonList(new byte[] {1, 2, 3});
        List<byte[]> b = Collections.singletonList(new byte[] {1, 2, 3});
        assertTrue(VerificationMaj.memesCertificats(a, b));
    }

    @Test
    public void memesCertificatsRefuseUneAutreCle() {
        List<byte[]> a = Collections.singletonList(new byte[] {1, 2, 3});
        List<byte[]> b = Collections.singletonList(new byte[] {1, 2, 4});
        assertFalse(VerificationMaj.memesCertificats(a, b));
    }

    @Test
    public void memesCertificatsRefuseUneCleEnPlusOuEnMoins() {
        List<byte[]> a = Arrays.asList(new byte[] {1}, new byte[] {2});
        List<byte[]> b = Collections.singletonList(new byte[] {1});
        assertFalse(VerificationMaj.memesCertificats(a, b));
        assertFalse(VerificationMaj.memesCertificats(b, a));
    }

    @Test
    public void memesCertificatsRefuseLeVide() {
        assertFalse(VerificationMaj.memesCertificats(null, null));
        assertFalse(VerificationMaj.memesCertificats(Collections.emptyList(), Collections.emptyList()));
        assertFalse(VerificationMaj.memesCertificats(
                Collections.singletonList(new byte[0]), Collections.singletonList(new byte[0])));
    }

    @Test
    public void octetsReprisGardeLesMorceauxEntiers() {
        long taille = MORCEAU * 5L + 100;
        assertEquals(0, VerificationMaj.octetsRepris(0, taille, MORCEAU));
        assertEquals(MORCEAU * 2L, VerificationMaj.octetsRepris(MORCEAU * 2L, taille, MORCEAU));
        assertEquals(taille, VerificationMaj.octetsRepris(taille, taille, MORCEAU));
    }

    @Test
    public void octetsReprisRepartDeZeroSiLeFichierEstAbime() {
        long taille = MORCEAU * 5L + 100;
        assertEquals(0, VerificationMaj.octetsRepris(MORCEAU + 1, taille, MORCEAU));
        assertEquals(0, VerificationMaj.octetsRepris(taille + MORCEAU, taille, MORCEAU));
        assertEquals(0, VerificationMaj.octetsRepris(-5, taille, MORCEAU));
    }

    @Test
    public void empreinteValideNAccepteQueSoixanteQuatreHexMinuscules() {
        String bonne = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        assertTrue(VerificationMaj.empreinteValide(bonne));
        assertFalse(VerificationMaj.empreinteValide(bonne.toUpperCase()));
        assertFalse(VerificationMaj.empreinteValide(bonne.substring(1)));
        assertFalse(VerificationMaj.empreinteValide(bonne + "0"));
        assertFalse(VerificationMaj.empreinteValide("../" + bonne.substring(3)));
        assertFalse(VerificationMaj.empreinteValide(null));
    }
}
