# DIAG-MAINT V2 — Architecture

## 1. Principes

1. **Local d'abord (offline-first).** Le téléphone est la source de vérité d'un diagnostic en cours :
   conversation, hypothèses, contrôles, mesures, faits connus, photos. Tout est enregistré localement
   (localStorage + IndexedDB) après chaque action. Le serveur est **sans état** vis-à-vis d'un diagnostic
   en cours : il reçoit l'état, exécute un tour d'agent, renvoie le nouvel état.
2. **Un seul cœur d'agent, isomorphe.** Le moteur (`js/agent/*`), les outils et les règles métier
   (`js/model.js`, `js/safety.js`…) sont du JavaScript sans dépendance, exécutable **dans le navigateur
   et dans Node.js**. Le même code tourne :
   - côté serveur avec un vrai modèle d'IA (Anthropic) ;
   - côté téléphone avec le **moteur local** (sans IA) quand il n'y a pas de réseau ou pas de serveur.
3. **Aucune clé d'API dans le frontend.** Les clés sont des variables d'environnement du serveur
   (`server/.env`, jamais versionné). Le frontend ne connaît que l'URL du serveur et, si le serveur est
   exposé publiquement, un **jeton d'accès applicatif** saisi par l'utilisateur (pas une clé fournisseur).
4. **Règles de sécurité et de preuve codées dans le modèle, pas seulement dans le prompt.** Une hypothèse
   ne peut être « confirmée » sans résultat de contrôle ; un diagnostic ne peut être « confirmé » sans
   hypothèse confirmée ; les niveaux de risque sont calculés par le code et l'IA ne peut que les relever.

## 2. Vue d'ensemble

```
┌──────────────────────────── Téléphone / navigateur (PWA) ────────────────────────────┐
│  Frontend (js/views/*)          Chat agent · Panneau diagnostic · Arbre · Rapport     │
│        │                                                                              │
│  Client agent (js/agent/client.js) ── en ligne ──► POST /api/agent/turn               │
│        │                          └─ hors ligne ──► Moteur local (même cœur)          │
│  Cœur partagé : js/model.js · js/safety.js · js/knowledge.js · js/pannes/ · js/kb.js               │
│                 js/agent/tools.js · js/agent/engine.js · js/agent/local-provider.js   │
│  Stockage local : localStorage (données) · IndexedDB (photos) · file de synchro      │
└───────────────────────────────────────────────────────────────────────────────────────┘
                                   │ HTTPS (JSON)
┌──────────────────────────────── Serveur Node.js (server/) ────────────────────────────┐
│  HTTP (server/src/http.js) : fichiers statiques + API, CORS, jeton d'accès            │
│  Agent (server/src/agent/) : prompt système, contexte, boucle (cœur partagé)          │
│  AIProvider (server/src/providers/) : AnthropicProvider · OpenAIProvider · Local      │
│  Services : documents (server/src/services/documents.js) · base de connaissances     │
│             (knowledge.js) · stockage fichiers (files.js) · recherche Web (web.js)    │
│  Données : server/data/ (JSON + fichiers) — remplaçable par une vraie base plus tard  │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

## 3. Modèle de données (schéma 2)

Un diagnostic (`js/model.js`, migration automatique des diagnostics V1) contient notamment :

| Champ | Contenu |
|---|---|
| `client`, `site`, `location` | Identification de l'intervention |
| `installationType`, `brand`, `model`, `reference`, `serial` | Matériel |
| `description`, `symptoms` | Panne constatée |
| `hypotheses[]` | `{id, cause, reason, status: possible\|suspectee\|ecartee\|confirmee, evidence[], counterEvidence[], parentControlId}` |
| `controls[]` | `{id, hypothesisId, type, description, expected, why, location, risk, obtained, verdict, conclusion, doneAt…}` |
| `measurements[]` | `{id, kind, label, value, unit, location, controlId, result, comment, at}` |
| `facts[]` | Mémoire : `{id, question, answer, source, at}` — l'agent ne repose jamais une question déjà répondue |
| `messages[]` | Conversation : `{id, role: user\|assistant, text, attachments, trace[], ask, at}` |
| `photos[]` | `{id, kind, caption, analysis}` (fichier dans IndexedDB, copie serveur pour l'analyse) |
| `documents[]` | Références vers la base documentaire du serveur |
| `verdict` | `{status: non_confirme\|probable\|confirme, summary, missing[]}` |
| `parts[]`, `repair`, `recommendations`, `finalResult` | Clôture et rapport |

## 4. Agent

- **Boucle** (`js/agent/engine.js`) : envoie au fournisseur le prompt système, la conversation récente et
  un **instantané de l'état** ; exécute les appels d'outils ; recommence jusqu'à la réponse finale
  (limite d'itérations). Chaque appel d'outil produit une **trace** affichée dans l'interface
  (« Recherche effectuée », « Documentation consultée », « Photo analysée », « Mesure enregistrée »).
- **Format d'échange** : blocs de contenu au format Messages API d'Anthropic (lingua franca interne) ;
  un autre fournisseur traduit depuis/vers ce format.
- **Outils** (`js/agent/tools.js`) :
  - état : `ask_user`, `record_fact`, `update_equipment`, `set_fault`, `upsert_hypothesis`,
    `propose_control`, `save_measurement`, `record_control_result`, `set_diagnosis_status`,
    `suggest_report` ;
  - connaissance : `search_previous_diagnostics`, `search_documentation`, `read_document`,
    `analyze_image` ;
  - Web : outils serveur Anthropic `web_search` / `web_fetch` (exécutés chez Anthropic, sources citées).
  Les outils qui dépendent du serveur ne sont proposés qu'au moteur serveur.
- **Prompt système** : `server/src/agent/system-prompt.js` (règles métier, sécurité, méthode, style).

## 5. Fournisseurs d'IA

`AIProvider.complete({system, messages, tools, serverTools}) → {content, stop_reason, usage, model}`

| Fournisseur | État V2 |
|---|---|
| `AnthropicProvider` | Implémenté (SDK officiel). Modèle via `ANTHROPIC_MODEL` (défaut `claude-opus-5-5`), effort via `ANTHROPIC_EFFORT`, repli automatique en cas de refus (`fallbacks: "default"`). |
| `OpenAIProvider` | Squelette : interface prête, traduction non implémentée. |
| `LocalProvider` | Implémenté : moteur à règles, sans réseau, utilisé hors ligne et pour les tests. |

## 6. Hors connexion et synchronisation

- Tout est enregistré localement à chaque action.
- Sans réseau (ou sans serveur configuré), le client bascule sur le moteur local.
- Les diagnostics clôturés alimentent la base de connaissances locale ; une **file de synchronisation**
  (`js/sync.js`) les envoie au serveur (`POST /api/knowledge`) au retour de la connexion.
- Non implémenté en V2 : synchronisation bidirectionnelle multi-appareils et résolution de conflits.

## 7. Sécurité

- Niveaux de risque 1 à 4 calculés par `DM.riskLevel()` (type de contrôle + mots-clés + domaine) ;
  l'IA peut relever un niveau, jamais l'abaisser. Bannière **RISQUE** avant toute opération de niveau ≥ 2
  et validation explicite des consignes avant la saisie d'un résultat.
- Serveur : clés en variables d'environnement, jeton d'accès `APP_ACCESS_TOKEN` obligatoire hors
  `localhost`, CORS limité à `ALLOWED_ORIGINS`, tailles de requêtes et de fichiers limitées,
  chemins de fichiers confinés au dossier de données.
