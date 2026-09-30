# DIAG-MAINT — V1

Assistant de diagnostic de pannes pour techniciens de maintenance (électricité, électrotechnique,
HVAC, automatisme, moteurs, pompes, contrôle d'accès, incendie, maintenance industrielle).

Application web **mobile-first**, 100 % locale : aucune installation, aucun serveur distant,
aucune dépendance. Les données restent dans le navigateur de l'appareil.

## Lancer

**Windows (recommandé)** : double-cliquer sur `LANCER-DIAG-MAINT.bat`.
Le navigateur s'ouvre sur http://localhost:8080. Fermer la fenêtre noire pour arrêter.

Autres possibilités :
- en ligne de commande : `powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 8090]`
- ouvrir directement `index.html` (fonctionne, mais sans mode hors-ligne ni installation PWA) ;
- **sur smartphone** : héberger le dossier sur un hébergement statique HTTPS
  (GitHub Pages, Netlify Drop, serveur interne…), ouvrir l'URL puis « Ajouter à l'écran d'accueil ».
  L'application fonctionne ensuite hors-ligne.

## Tests

Ouvrir http://localhost:8080/tests/ (serveur lancé) : 35 tests unitaires sur la logique métier,
la sécurité, les suggestions, le compte-rendu et le stockage.

## Structure

```
index.html              coque de l'application
css/styles.css          styles (thèmes clair/sombre, impression)
js/utils.js             utilitaires (échappement, dates, normalisation)
js/icons.js             icônes techniques SVG
js/safety.js            types de contrôle + règles de sécurité (consignation, sous tension…)
js/knowledge.js         base de pannes : hypothèses et contrôles types par domaine
js/model.js             modèle métier : arbre symptôme → hypothèse → contrôle → résultat
js/report.js            construction du compte-rendu
js/store.js             persistance localStorage (diagnostics, réglages)
js/photos.js            photos compressées dans IndexedDB
js/ui.js                modales, notifications, galerie photo
js/app.js               routeur, navigation, opérations partagées
js/views/*.js           écrans : accueil, formulaire, diagnostic, compte-rendu, historique, réglages
sw.js, manifest.webmanifest, icons/   PWA (hors-ligne, installation)
serve.ps1, LANCER-DIAG-MAINT.bat      serveur local Windows
tests/                  tests unitaires (navigateur)
```

## Règles métier clés

- Une hypothèse ne peut être **confirmée** que si au moins un de ses contrôles a un **résultat saisi**.
- Écarter une hypothèse sans résultat exige une justification écrite.
- Le diagnostic ne peut être **clôturé** qu'avec une hypothèse confirmée et un diagnostic final rédigé.
- Les contrôles à risque (sous tension, hors tension, fluides, essais incendie/machine, mots-clés
  comme « condensateur », « variateur », « 400 V »…) exigent de valider les consignes de sécurité
  **avant** la saisie du résultat.

## Sauvegarde

Les données sont liées au navigateur et à l'appareil. Utiliser **Réglages → Exporter une sauvegarde**
régulièrement (fichier JSON, photos incluses) ; **Importer** pour restaurer ou transférer.

> Les suggestions de l'assistant sont indicatives. Le technicien reste responsable de ses conclusions
> et du respect des règles de sécurité (NF C 18-510, consignes du site).
