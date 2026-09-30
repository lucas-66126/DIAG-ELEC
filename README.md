# DIAG-MAINT V2 — agent IA de diagnostic technique

DIAG-MAINT accompagne un technicien de maintenance pendant toute la recherche de panne, sur son téléphone :
**observer → mesurer → analyser → tester → confirmer → réparer → rapport**.

Domaines : électricité, électrotechnique, climatisation / HVAC, automatisme, moteurs, pompes,
contrôle d'accès, sécurité incendie, maintenance industrielle.

- **Conversation** avec l'agent : une question courte à la fois, réponses rapides, photo, document, mesure,
  « ✓ contrôle effectué », dictée vocale.
- **Panneau « État du diagnostic »** : matériel, panne, verdict (non confirmé / probable / confirmé et ce qui manque),
  hypothèses avec preuves et contre-preuves, contrôles (✓ faits, ▶ prochain, ○ prévus), mesures horodatées,
  faits connus (mémoire).
- **Sécurité** : niveaux de risque 1 à 4, bannière **RISQUE** et validation des consignes avant les opérations dangereuses.
- **Transparence** : « Recherche Web effectuée » (avec sources), « Documentation consultée », « Photo analysée »,
  « Mesure enregistrée ».
- **Base documentaire** (fabricant › catégorie › série › modèle › référence) et **base de connaissances**
  (panne similaire, même référence, même code défaut, même symptôme).
- **Rapport** : client/site, équipement, panne, symptômes, photos, contrôles, mesures, diagnostic, réparation,
  pièces, recommandations, résultat final — export PDF.
- **Hors connexion** : tout est enregistré sur le téléphone ; sans réseau, un moteur local (sans IA) prend le relais ;
  les diagnostics terminés sont synchronisés au retour de la connexion.

Architecture : voir [ARCHITECTURE.md](ARCHITECTURE.md). Avancement : [PROGRESS.md](PROGRESS.md).

## Lancer

**Windows** : double-cliquer sur `LANCER-DIAG-MAINT.bat` (installe les dépendances la première fois, démarre le
serveur et ouvre http://localhost:8787).

Ou en ligne de commande :

```bash
cd server
npm install
npm start
```

Prérequis : Node.js 20 ou plus récent (`winget install OpenJS.NodeJS.LTS`).

## Configurer la clé d'API (IA)

1. Créer une clé sur https://console.anthropic.com (section *API Keys*).
2. Copier `server/.env.example` en `server/.env` et renseigner `ANTHROPIC_API_KEY=…`.
3. Redémarrer le serveur : la console affiche « Fournisseur IA : anthropic (claude-opus-5-5…) + recherche Web ».

La clé reste sur le serveur : elle n'est jamais envoyée au navigateur ni versionnée (`.gitignore`).
Options utiles dans `.env` : `ANTHROPIC_MODEL`, `ANTHROPIC_EFFORT` (low → max), `WEB_SEARCH=false`,
`AI_PROVIDER=local` (forcer le moteur local).

Sans clé, l'application fonctionne avec le **moteur local** : il guide le diagnostic avec la base de pannes intégrée,
mais n'analyse ni photos ni documents et ne cherche pas sur le Web.

## Utiliser depuis un téléphone

- **Même réseau Wi-Fi** : dans `server/.env`, mettre `HOST=0.0.0.0` et un `APP_ACCESS_TOKEN` (obligatoire),
  puis ouvrir `http://<adresse-du-PC>:8787` sur le téléphone et saisir le jeton dans *Réglages → Serveur IA*.
  (Sans HTTPS, l'installation sur l'écran d'accueil et la dictée peuvent être limitées.)
- **En déplacement** : héberger le dossier `server/` chez un hébergeur Node.js (HTTPS), avec les mêmes variables
  d'environnement. Le site GitHub Pages peut aussi servir d'interface : renseigner l'adresse du serveur dans
  *Réglages → Serveur IA* et l'ajouter à `ALLOWED_ORIGINS`.

## Tester

```bash
cd server
npm test
```

40 tests Node (modèle, agent, fournisseur Anthropic simulé, API HTTP) dont le **scénario Mitsubishi** complet
avec une IA simulée et avec le moteur local. Tests navigateur de la logique métier : ouvrir
http://localhost:8787/tests/ (35 tests).

## Structure

```
index.html, css/, icons/, manifest.webmanifest, sw.js   interface (PWA)
js/model.js, safety.js, knowledge.js, kb.js, report.js   cœur métier partagé (navigateur + serveur)
js/agent/tools.js, engine.js, local-provider.js          cœur de l'agent partagé
js/agent/client.js, js/sync.js                           client de l'agent, file de synchronisation
js/views/                                                écrans (agent = conversation, diag = arbre, rapport…)
server/src/                                              serveur : HTTP, prompt système, fournisseurs d'IA, services
server/tests/                                            tests Node
tests/                                                   tests navigateur
```

> Les suggestions de l'agent sont une aide : le technicien reste responsable de ses conclusions et du respect des
> règles de sécurité (NF C 18-510, consignes du site).
