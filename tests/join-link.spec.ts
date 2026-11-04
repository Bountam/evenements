import { expect, test } from '@playwright/test';
import { buildNativeJoinLink, parseJoinLink } from '../src/utils/joinLink';

test('Lien insertech://rejoindre : création puis lecture', () => {
  const lien = buildNativeJoinLink('INS-4821-AB12', 'ABCDEFGHJKLM', 'Install Fest « Automne » & co');
  expect(lien.startsWith('insertech://rejoindre?')).toBe(true);
  expect(lien).not.toMatch(/https?:/);
  expect(parseJoinLink(lien)).toEqual({ code: 'INS-4821-AB12', cle: 'ABCDEFGHJKLM', nom: 'Install Fest « Automne » & co' });
  // Saisie tolérante : minuscules, clé avec tirets, sans nom
  expect(parseJoinLink('insertech://rejoindre?code=ins-4821-ab12&cle=abcd-efgh-jklm')).toEqual({
    code: 'INS-4821-AB12',
    cle: 'ABCDEFGHJKLM',
    nom: ''
  });
});

test('Lien insertech://rejoindre : liens refusés', () => {
  for (const texte of [
    '',
    'bonjour',
    'https://bountam.github.io/evenements/?rejoindre=INS-4821-AB12',
    'WIFI:T:WPA;S:Partage;P:secret;;',
    'insertech://autre?code=INS-4821-AB12&cle=ABCDEFGHJKLM',
    'insertech://rejoindre?code=INS-4821-AB12',
    'insertech://rejoindre?code=INS-4821-AB12&cle=ABCDEFGHJKL0',
    'insertech://rejoindre?code=XYZ&cle=ABCDEFGHJKLM'
  ]) {
    expect(parseJoinLink(texte), texte).toBeNull();
  }
});
