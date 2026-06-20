# Notes — Vivlio HD Color Light

Application de prise de notes **optimisée e-ink** pour la liseuse Vivlio HD Color Light (Android).

## Caractéristiques
- **100 % noir & blanc, fort contraste** — pas de gris clairs ni d'ombres (rendu net sur e-ink).
- **Aucune animation** — évite le ghosting de l'écran à encre électronique.
- **Gros boutons tactiles** adaptés au doigt sur une dalle de liseuse.
- **Sauvegarde locale** (AsyncStorage) — fonctionne hors-ligne, rien n'est envoyé sur internet.
- Liste de notes triée par date de modification, recherche, éditeur plein écran.
- La **première ligne** d'une note devient automatiquement son titre.
- **Appui long** sur une note = supprimer.

## Construire l'APK
Le build se fait via **EAS (Expo)**, comme le projet `memo-apk` voisin.

### Option A — automatique (GitHub Actions)
1. `git push` (le workflow `Build Notes APK` se déclenche sur tout changement dans `notes-apk/`).
2. Récupère l'APK dans l'onglet **Actions → artifact `notes-apk`**.
3. Nécessite le secret `EXPO_TOKEN` (déjà configuré pour memo-apk).

### Option B — manuelle (en local)
```bash
cd notes-apk
npm install
npx eas-cli build --platform android --profile preview
```
Télécharge l'APK depuis le lien fourni par EAS.

## Installer sur la Vivlio
1. Active **« Sources inconnues »** dans les réglages Android de la liseuse.
2. Copie `notes.apk` sur la Vivlio (câble USB ou téléchargement direct).
3. Ouvre le fichier avec le gestionnaire de fichiers et installe.
