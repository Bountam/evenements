# Push, Pull Request et Release

Ce guide décrit comment une modification va du poste de travail jusqu'aux PC et aux tablettes de l'événement.
Il s'applique au dépôt `Bountam/evenements`.

```
branche de travail ──push──▶ Pull Request ──CI « Vérification de PR »──▶ fusion dans main
                                                                            │
                                         CI/CD sur main : build complet, PWA sur GitHub Pages,
                                         test Android sur émulateur
                                                                            │
                         npm version ──▶ fusion ──▶ tag v1.9.0 ──▶ Release GitHub (exe, APK, .deb, PWA…)
                                                                            │
                         PC hôte : « Nouvelle version » ──▶ tablettes mises à jour par le PC (réseau local)
```

| Workflow | Fichier | Quand | Ce qu'il fait |
| --- | --- | --- | --- |
| Vérification de PR | `.github/workflows/pr-check.yml` | Chaque push sur une PR vers `main` | Lint, bundle, tous les tests Playwright (dont « zéro défilement »), exe, binaire Linux, APK, installeurs. Artefacts gardés 7 jours. |
| Test Android sur émulateur | `.github/workflows/android-emulateur.yml` | PR qui touche `android/`, chaque push sur `main`, ou à la demande | L'APK démarre sur Android 10 et 15 sans services Google. Dure 10 à 15 minutes. |
| CI / CD Pipeline | `.github/workflows/ci-cd.yml` | Push sur `main`, tag `v*` ou `V*`, ou à la demande | Même build que la PR, déploiement de la PWA sur GitHub Pages (`main`), publication de la release (tag). |
| Build multiplateforme | `.github/workflows/build.yml` | Appelé par les deux précédents | Le build lui-même, partagé. |

---

## 1. Push : envoyer son travail

### 1.1 Toujours partir de `main` à jour

```bash
git checkout main
git pull                      # récupère ce qui a été fusionné depuis
git checkout -b feat/ma-modif # une branche par sujet
```

Noms de branche conseillés : `feat/…` (nouveauté), `fix/…` (correctif), `docs/…`, `chore/…`.

### 1.2 Vérifier avant de pousser

```bash
npm ci                 # seulement si package-lock.json a changé
npm run lint           # types, design system, garde-fou « zéro défilement », versions synchronisées
npm run build          # bundle dist/ + garde-fou : aucune clé iFixit dans le bundle
npm run test:ui        # tous les tests Playwright (le build doit être fait avant)
npm run galerie        # facultatif : captures/index.html pour revoir chaque écran
```

`npm run lint` refuse :
- un défilement hors `ScrollZone` (`overflow-auto`, `overflow-y-auto`) ;
- `h-screen` ou une unité `vh` (utiliser `dvh`) ;
- une couleur codée en dur ;
- des versions différentes entre `package.json`, le lanceur .NET, `app.manifest` et l'APK.

### 1.3 Commits

Un commit par idée, message au format « type(portée): description » en français :

```
feat(guides): fiches locales complètes
fix(concours): le PC refuse la piste d'un autre juge
docs(readme): section zéro défilement
chore(release): version 1.9.0
```

### 1.4 Pousser la branche

```bash
git push -u origin feat/ma-modif
```

Si le push est refusé parce que la branche distante a avancé : `git pull --no-rebase` puis repousser.
Ne jamais forcer (`--force`) une branche partagée ni `main`.

> **Pousser directement sur `main` ?** C'est possible, mais rien ne vérifie le code avant qu'il arrive dans
> `main` : la « Vérification de PR » ne tourne pas, et une erreur part tout de suite sur GitHub Pages.
> Depuis la v1.9.0, le test sur émulateur tourne quand même à chaque push sur `main`. Préférer une Pull Request.

---

## 2. Pull Request : faire vérifier puis fusionner

### 2.1 Ouvrir la PR

Sur GitHub, le bandeau « Compare & pull request » apparaît après le push. Base : `main`.
Le modèle `.github/pull_request_template.md` se remplit tout seul :
- **Description** : ce qui change, en quelques puces.
- **Type de changement** : cocher `feat`, `fix`, `docs`, `chore` ou `refactor`.
- **Liste de contrôle** : lint, build, tests, puis les essais de l'exe, du binaire Linux et de l'APK.

Une PR en **brouillon** (*Draft*) signale qu'elle n'est pas finie. Cliquer « Ready for review » quand elle l'est.

### 2.2 Lire le résultat de la CI

Dans l'onglet **Checks** de la PR :
- tout vert : on peut fusionner ;
- rouge : ouvrir le job, lire l'étape en échec. Si un test Playwright échoue, l'artefact `rapport-test-rendu`
  contient le rapport HTML (captures et traces).

Les **artefacts** de la PR (en bas de la page du run, 7 jours) :
- `InsertechEvenements-Windows-x64` et `InsertechEvenements-Linux-Debian-x64` : à essayer sur un PC ;
- `InsertechEvenements-Android-APK` : à installer sur une tablette de test ;
- `InsertechEvenements-Installeurs` : `.deb` et `Setup.exe` ;
- `galerie-zero-defilement` : ouvrir `index.html` pour voir chaque écran à chaque taille.

Chaque nouveau push sur la PR annule le run précédent et en relance un.

### 2.3 Fusionner

1. CI verte, essais faits.
2. Bouton **Merge pull request** (ou *Squash and merge* pour une PR à un seul sujet ; garder *Merge* quand
   chaque commit compte, comme une PR « une étape par commit »).
3. Supprimer la branche (bouton proposé par GitHub).
4. En local :

```bash
git checkout main
git pull
git branch -d feat/ma-modif
```

La fusion lance « CI / CD Pipeline » sur `main` : build complet, puis la PWA est publiée sur
https://bountam.github.io/evenements/ quelques minutes plus tard.

### 2.4 Récupérer le travail d'une autre branche (pull)

```bash
git fetch origin
git checkout nom-de-la-branche   # crée la branche locale qui suit origin/nom-de-la-branche
git pull                         # plus tard, pour récupérer les nouveaux commits
```

Pour mettre une branche à jour avec `main` : `git merge origin/main` (pas de rebase sur une branche partagée).

---

## 3. Release : publier une version

La version de `package.json` est la **seule source de vérité**. Le tag doit lui correspondre exactement,
sinon le pipeline refuse de publier.

### 3.1 Choisir le numéro

| Commande | Exemple | Quand |
| --- | --- | --- |
| `npm version patch` | 1.9.0 → 1.9.1 | Correctifs seulement |
| `npm version minor` | 1.9.1 → 1.10.0 | Nouveautés compatibles |
| `npm version major` | 1.10.0 → 2.0.0 | Changement qui casse : format de données, protocole tablette incompatible |

`npm version` lance `scripts/sync-version.js`, qui recopie la version dans :
- `launcher/InsertechLauncher.csproj` (exe Windows et Linux) ;
- `app.manifest` ;
- `android/app/build.gradle` : `versionName` et `versionCode` = majeur × 10000 + mineur × 100 + correctif
  (1.9.0 → 10900). Le `versionCode` doit toujours monter, sinon Android refuse la mise à jour.

### 3.2 Façon A : depuis une Pull Request (recommandée)

1. Dans la PR, ou une petite PR à part :

   ```bash
   npm version minor --no-git-tag-version   # monte la version sans créer de tag
   ```

2. Ajouter la section de la version en haut de `CHANGELOG.md` (`## [1.10.0] — AAAA-MM-JJ`, puis
   Ajouté / Amélioré / Corrigé / Sécurité).
3. Commit `chore(release): version 1.10.0`, push, CI verte, **fusionner**.
4. Publier, au choix :
   - GitHub → **Actions** → **CI / CD Pipeline** → **Run workflow** → branche `main`,
     `release_tag` = `v1.10.0` → **Run workflow** ;
   - ou en local, sur `main` à jour :

     ```bash
     git checkout main && git pull
     git tag v1.10.0
     git push origin v1.10.0
     ```

> Pousser le changement de version **avant** de fusionner la PR : une fois la PR fusionnée, il faut une
> nouvelle PR pour monter la version.

### 3.3 Façon B : directement sur `main`

```bash
git checkout main && git pull
npm version minor          # monte la version, crée le commit « 1.10.0 » et le tag v1.10.0
# compléter CHANGELOG.md, puis : git commit --amend --no-edit -a   (avant le push seulement)
git push --follow-tags     # pousse le commit et le tag : la release part
```

### 3.4 Ce que fait le pipeline

1. **Version** : vérifie que le tag ressemble à `v1.2.3` (ou `V1.2.3`) et vaut la version de `package.json`.
2. **Build** : bundle web, tests, exe Windows, binaire Linux, APK, `.deb`, `Setup.exe`.
3. **Release** : publie la release GitHub avec des notes générées à partir des PR, et ces fichiers :

| Fichier | Pour |
| --- | --- |
| `InsertechEvenements-Setup-X.Y.Z.exe` | Installeur Windows (sans droits administrateur) |
| `InsertechEvenements.exe` | Exe Windows portable |
| `insertech-evenements_X.Y.Z_amd64.deb` | Installeur Linux (Debian, Ubuntu, Mint) |
| `InsertechEvenements-linux-x64` et `.tar.gz` | Binaire Linux portable |
| `InsertechEvenements-Android.apk` | Tablettes Android 10 et plus |
| `InsertechEvenements-PWA-Android.zip`, `index.html`, `InsertechEvenements-Mobile.html` | Version web autonome |
| `SHA256SUMS.txt` | Empreintes pour vérifier les téléchargements |

S'il manque un seul fichier, la release n'est pas publiée : pas de release incomplète. Compter 6 à 10 minutes.

### 3.5 Après la publication

1. Ouvrir la page **Releases** : les fichiers et `SHA256SUMS.txt` y sont. Compléter les notes si besoin
   (copier la section du `CHANGELOG.md`).
2. **PC hôte** : au démarrage avec internet, l'application affiche « Nouvelle version (X.Y.Z) »
   (`src/utils/updateCheck.ts`, lit la dernière release). Installer le `Setup.exe` (ou le `.deb`).
   La mise à jour est bloquée pendant un chrono en cours ou une session active.
3. **Tablettes** : pas besoin d'internet sur les tablettes. Dans la fenêtre Réseau local du PC hôte, le panneau
   de mise à jour des tablettes télécharge l'APK de la release (ou prend un fichier `.apk` choisi à la main si
   le PC n'a pas internet), puis le pousse à chaque tablette reliée (protocole `MAJ_*`, `src/net/miseAJour.ts`). La tablette vérifie
   l'empreinte et la signature avant d'installer. Voir `docs/android-verification-tablette.md`.
4. Garder l'APK de la version précédente sous la main tant que la nouvelle n'a pas été essayée sur une vraie
   tablette.

### 3.6 Checklist de release

- [ ] `main` à jour, CI verte sur le dernier commit
- [ ] `npm version …` fait, `npm run lint` dit « Version X.Y.Z synchronisée sur toutes les cibles »
- [ ] `CHANGELOG.md` complété
- [ ] Version fusionnée dans `main`
- [ ] Tag `vX.Y.Z` poussé ou workflow lancé avec `release_tag`
- [ ] Release publiée avec tous ses fichiers
- [ ] Essai : installation sur le PC hôte, mise à jour d'une tablette par le PC

---

## 4. Dépannage

| Message ou symptôme | Cause | Solution |
| --- | --- | --- |
| « Le tag v1.10.0 ne correspond pas à la version 1.9.0 de package.json » | Tag poussé sans monter la version | Supprimer le tag (`git push --delete origin v1.10.0` et `git tag -d v1.10.0`), faire `npm version`, fusionner, retaguer |
| « Le tag doit ressembler à v1.2.3 » | Tag mal formé (`v1.10`, `1.10.0`, `release-1.10.0`) | Utiliser `vX.Y.Z` |
| « Fichier manquant : … » | Un build a échoué ou un fichier a été renommé | Lire le job de build en échec ; relancer le workflow avec le même `release_tag` une fois corrigé |
| `npm run lint` : versions non synchronisées | Version modifiée à la main dans `package.json` | `node scripts/sync-version.js` puis commit |
| Les tablettes refusent l'APK | `versionCode` pas plus grand, ou APK signé avec une autre clé | Toujours passer par `npm version` ; ne jamais changer `android/app/debug.keystore` ni la clé de release |
| Push refusé (`non-fast-forward`) | La branche distante a des commits en plus | `git pull --no-rebase` puis `git push` |
| « Vérification de PR » ne se lance pas | Le push est allé sur `main` sans PR | Normal : passer par une PR pour avoir la vérification |
| Release publiée mais l'application ne propose rien | Pas d'internet, limite de l'API GitHub atteinte, ou version ignorée | Réessayer plus tard ; « Ignorer cette version » se lève à la version suivante |
