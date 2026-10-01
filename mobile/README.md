# DIAG-MAINT — application Android

L'application Android est l'application web (dossier parent) embarquée dans une enveloppe
[Capacitor](https://capacitorjs.com) : elle fonctionne hors connexion, avec le moteur local. L'assistant IA reste
facultatif : il faut renseigner l'adresse d'un serveur DIAG-MAINT hébergé dans *Réglages → Serveur IA*
(la clé d'API reste sur ce serveur, jamais dans l'application).

## Fabrication

Rien à installer sur le PC : GitHub fabrique l'application à chaque envoi (`.github/workflows/android.yml`).

- **Version d'essai** (`diag-maint-essai-apk`) : un fichier `.apk` à installer directement sur un téléphone.
  À télécharger dans l'onglet *Actions* du dépôt, sur la dernière exécution réussie.
- **Version de publication** (`diag-maint-play-store-aab`) : un fichier `.aab` signé, fabriqué seulement quand la clé de
  signature est enregistrée dans les secrets du dépôt.

## Clé de signature (une seule fois)

Le Play Store exige que chaque version soit signée avec la même clé. Elle ne doit jamais être dans le dépôt.
Quatre secrets sont à créer dans *Settings → Secrets and variables → Actions* :

| Secret | Contenu |
|---|---|
| `DIAGMAINT_KEYSTORE_BASE64` | le fichier de clé (`.p12`) encodé en base64 |
| `DIAGMAINT_KEYSTORE_PASSWORD` | le mot de passe du fichier |
| `DIAGMAINT_KEY_ALIAS` | le nom de la clé dans le fichier |
| `DIAGMAINT_KEY_PASSWORD` | le mot de passe de la clé |

Conserver une copie du fichier de clé et de ses mots de passe hors du PC : sans eux, impossible de publier une mise à jour.

## Changer de version

Modifier `version` dans `mobile/package.json` : le numéro affiché et le code de version Android en découlent
(2.2.0 → code 20200). Le Play Store refuse un fichier dont le code de version n'a pas augmenté.

## Commandes (pour un développeur)

```bash
cd mobile
npm ci
npm run sync      # copie l'interface dans www/ puis dans le projet Android
npm run icones    # régénère les icônes à partir du dessin (build-icons.js)
```

`play-store/FICHE.md` contient les textes et les réponses aux formulaires de la Play Console.

## Différences avec la version web

- Pas d'impression : le rapport se partage (message, courriel, autre application).
- Les exports (.txt, sauvegarde .json) passent par la feuille de partage Android.
- Pas de dictée vocale (indisponible dans une application embarquée).
