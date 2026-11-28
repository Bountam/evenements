import { expect, test } from '@playwright/test';
import { FakeTablette } from './helpers/fakeTablette';
import { preparerPcHote } from './helpers/pcHote';

// Plan v1.9, étape 4 : chaque juge a ses pistes, réservées par le PC hôte. Deux juges qui agissent dans
// la même seconde ne peuvent plus écraser le joueur de l'autre.

const action = (message: unknown) => ({ type: 'CHRONO_ACTION', message });

test('Juges : pistes réservées par le PC, refus clair, aucun joueur écrasé en cas de course', async ({ page }) => {
  test.setTimeout(90_000);
  const tablettes: FakeTablette[] = [];
  const { code, cle, sorties } = await preparerPcHote(page, () => tablettes, 47997);
  const a = new FakeTablette(code, cle, 'Juge A');
  const b = new FakeTablette(code, cle, 'Juge B');
  tablettes.push(a, b);
  await a.demarrer();
  await b.demarrer();
  try {
    await expect(page.getByText('Connectée', { exact: true })).toHaveCount(2, { timeout: 15_000 });
    a.envoyer({ type: 'REQUEST_INITIAL_SYNC', version: '1.9.0' });
    const sync = await a.attendre((m) => m.type === 'INITIAL_SYNC');
    const eventId = sync.payload.event.id;

    // 1. Les deux juges réclament les pistes 1 et 2 dans la même seconde : un seul les obtient
    a.envoyer(action({ type: 'JUDGE_CLAIM', judgeId: 'juge-a', judgeName: 'Juge A', trackIds: [1, 2] }));
    b.envoyer(action({ type: 'JUDGE_CLAIM', judgeId: 'juge-b', judgeName: 'Juge B', trackIds: [1, 2] }));
    const perdant = await Promise.race([
      a.attendre((m) => m.type === 'CHRONO_REJECTED').then(() => 'a'),
      b.attendre((m) => m.type === 'CHRONO_REJECTED').then(() => 'b')
    ]);
    const [gagnant, autre] = perdant === 'a' ? [b, a] : [a, b];
    const idGagnant = perdant === 'a' ? 'juge-b' : 'juge-a';
    const idAutre = perdant === 'a' ? 'juge-a' : 'juge-b';

    // 2. Le perdant réclame 1 à 4 : seules 3 et 4 lui sont accordées
    autre.recus.length = 0;
    autre.envoyer(action({ type: 'JUDGE_CLAIM', judgeId: idAutre, judgeName: 'Autre', trackIds: [1, 2, 3, 4] }));
    const etat = await autre.attendre((m) => m.type === 'CHRONO_ACTION' && m.message.type === 'TRACKS_STATE_SYNC');
    expect(etat.message.tracks[3].ownerJudgeId).toBe(idAutre);
    expect(etat.message.tracks[4].ownerJudgeId).toBe(idAutre);
    expect(etat.message.tracks[1].ownerJudgeId).toBe(idGagnant);

    // 3. Course : le gagnant place son joueur sur la piste 1 pendant que l'autre juge tente la même piste
    autre.recus.length = 0;
    gagnant.envoyer(
      action({ type: 'TRACK_ASSIGN', trackId: 1, participantId: 'p-1', participantName: 'Joueur Un', eventId, judgeId: idGagnant, judgeName: 'G' })
    );
    autre.envoyer(
      action({ type: 'TRACK_ASSIGN', trackId: 1, participantId: 'p-2', participantName: 'Joueur Deux', eventId, judgeId: idAutre, judgeName: 'A' })
    );
    const refus = await autre.attendre((m) => m.type === 'CHRONO_REJECTED' && m.actionType === 'TRACK_ASSIGN');
    expect(refus).toMatchObject({ trackId: 1, reason: 'autre_juge' });

    // 4. Le même juge ne peut pas non plus écraser un joueur déjà assis sur sa piste
    gagnant.recus.length = 0;
    gagnant.envoyer(
      action({ type: 'TRACK_ASSIGN', trackId: 1, participantId: 'p-3', participantName: 'Joueur Trois', eventId, judgeId: idGagnant, judgeName: 'G' })
    );
    expect(await gagnant.attendre((m) => m.type === 'CHRONO_REJECTED')).toMatchObject({ trackId: 1, reason: 'occupee' });

    // 5. État final vu par une nouvelle synchro : Joueur Un est toujours sur la piste 1
    autre.recus.length = 0;
    autre.envoyer({ type: 'REQUEST_INITIAL_SYNC', version: '1.9.0' });
    const fin = await autre.attendre((m) => m.type === 'CHRONO_ACTION' && m.message.type === 'TRACKS_STATE_SYNC');
    expect(fin.message.tracks[1]).toMatchObject({ participantId: 'p-1', participantName: 'Joueur Un', ownerJudgeId: idGagnant });

    // 6. Sur le laptop, « Libérer » rend la piste 2 (réservée, libre) disponible
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'Pistes' }).click();
    autre.recus.length = 0;
    await page.getByRole('button', { name: /Libérer la piste 2 réservée/ }).click();
    const lib = await autre.attendre((m) => m.type === 'CHRONO_ACTION' && m.message.type === 'TRACK_RELEASE');
    expect(lib.message.trackId).toBe(2);
  } finally {
    await a.arreter();
    await b.arreter();
  }
  expect(sorties).toEqual([]);
});
