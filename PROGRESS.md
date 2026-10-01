# DIAG-MAINT V2 — Avancement

Légende : ✅ terminé et testé · 🔌 prêt, à connecter (dépend d'une clé / d'un hébergement) · ⬜ non fait

## Étape 0 — Inspection de la V1
- ✅ Architecture V1 : PWA statique sans dépendance, cœur métier pur (`model.js`, `safety.js`,
  `knowledge.js`, `report.js`), vues séparées, stockage local, 35 tests.
- ✅ Conservé : modèle d'arbre et règles de preuve, sécurité, base de pannes, rapport, historique,
  photos IndexedDB, PWA, thèmes. La vue « arbre » V1 reste accessible depuis chaque diagnostic.

## Étapes V2
| # | Étape | État |
|---|---|---|
| 1 | Node.js installé, `ARCHITECTURE.md`, `PROGRESS.md` | ✅ |
| 2 | Modèle schéma 2 + migration V1 (statuts possible/suspectée/écartée/confirmée, preuves, mesures, faits, messages, verdict, pièces) | ✅ |
| 3 | Base de connaissances (panne similaire / même référence / même code défaut / même symptôme) | ✅ |
| 4 | Cœur d'agent partagé : outils, boucle, garde-fous, moteur local | ✅ |
| 5 | Serveur Node : HTTP, AIProvider (Anthropic / OpenAI / Local), prompt système | ✅ · 🔌 clé Anthropic |
| 6 | Services : documents, stockage fichiers, images, connaissances | ✅ |
| 7 | Recherche Web (outils serveur Anthropic, sources affichées) | ✅ code · 🔌 clé Anthropic |
| 8 | Frontend : conversation, panneau, mode terrain, mesures, photos typées, documents, dictée | ✅ |
| 9 | Niveaux de risque 1–4, bannière RISQUE, validation des consignes | ✅ |
| 10 | Rapport V2 + export PDF (impression navigateur) | ✅ |
| 11 | File de synchronisation (diagnostics terminés → serveur) | ✅ |
| 12 | Tests : 40 Node + 35 navigateur | ✅ |
| 13 | Scénario Mitsubishi : IA simulée (tests), moteur local (tests + interface mobile) | ✅ · 🔌 avec la vraie IA |

## V2.1 — Base de pannes enrichie et banque de cas (2026-10-01)
- ✅ Base de pannes réécrite par domaine (`js/pannes/`) : **170 causes, 282 contrôles** (68 causes la veille), une réparation
  conseillée par cause, contrôle final de confirmation, contrôles de localisation.
- ✅ Banque de **192 cas concrets** rejoués automatiquement (`server/tests/cas/`, `npm run cas`), intégrée à `npm test`.
- ✅ Moteur local : pannes des domaines voisins ou cités (« moteur de la pompe »), indices forts, prise en compte du
  différentiel et du délai de déclenchement, résultat d'un contrôle repris pour les autres pistes, courants équilibrés
  mais trop élevés (surcharge), compréhension de « rien d'anormal », « pas bon », « bobine coupée », confirmation
  différée tant qu'il reste des pistes, relance par une question ouverte quand les pistes sont épuisées.
- ✅ Tests : 49 Node + 35 navigateur.

### Mesures (moteur local seul, sans IA)
| Série | Cas | Version de la veille | Premier passage | Après enrichissement |
|---|---|---|---|---|
| Mise au point + validation (écrites avec la base) | 74 | 19 % | 100 % | 100 % |
| Terrain (style SMS, écrite sans regarder la base) | 28 | 14 % | 54 % | 100 % |
| Aveugle 1 (écrite après la mise au point) | 30 | 13 % | **63 %** | 100 % |
| Aveugle 2 (après la 2e passe) | 30 | — | **70 %** | 100 % |
| Aveugle 3 (après la 3e passe) | 30 | — | **70 %** | 100 % |

Lecture : le « premier passage » d'une série à l'aveugle est le seul chiffre qui dit ce que vaut le moteur sur une panne
qu'il n'a jamais vue : **environ 70 %**. Les échecs restants sont presque tous des matériels ou des causes absents de la
base (onduleur, porte automatique, pompe à vide…) : quand la cause est dans la base, le cas est résolu dans près de neuf
cas sur dix. Les séries sont écrites par le même auteur que la base : sur de vraies pannes de terrain, le taux peut être
plus bas. Chaque échec devient un cas de la banque et une cause de plus dans la base.

### Limites connues du moteur local
- Il ne trouve que ce qui est dans la base ; hors base, il le dit et demande une observation de plus.
- Il comprend les tournures courantes, pas tout : une réponse ambiguë lui fait demander « conforme ou non ? ».
- Le banc d'essai répond « rien d'anormal » à tout contrôle non prévu : il ne mesure pas la qualité des questions,
  seulement l'aboutissement au bon diagnostic.

## Restant à connecter / limites connues
- 🔌 **Clé Anthropic** : sans elle, pas d'IA réelle (analyse de photos, lecture de PDF, recherche Web).
  Le comportement de Claude a été testé avec un fournisseur simulé, pas avec l'API réelle.
- 🔌 **Hébergement HTTPS** du serveur pour un usage mobile hors du réseau local.
- ⬜ `OpenAIProvider` : squelette seulement (traduction du format à écrire).
- ⬜ Synchronisation complète multi-appareils (seule la base de connaissances est synchronisée).
- ⬜ Export PDF natif (le PDF passe par l'impression du navigateur).

## Journal
- 2026-09-30 : démarrage V2, Node.js 24 installé.
- 2026-09-30 : cœur partagé + serveur ; bugs corrigés en route : garde-fou « question déjà posée » trop large ;
  ordre du plan de contrôle ; mesure rattachée au mauvais contrôle (unité incohérente) ; MΩ confondu avec mΩ ;
  carte « contrôle proposé » ne correspondant pas à la question posée.
- 2026-09-30 : interface V2 testée sur mobile (375 px) et bureau : scénario Mitsubishi de bout en bout,
  erreur d'API + reprise, bascule hors ligne, photo, document, clôture, synchronisation, rapport.
- 2026-10-01 : V2 publiée ; trois cas de panne détaillés ajoutés aux tests (convoyeur, CPI en régime IT, SSI).
- 2026-10-01 : V2.1 — base de pannes enrichie en quatre passes, banque de 192 cas. Tests adaptés parce que la règle a
  changé : scénario Mitsubishi local (« condenseur très encrassé » est compris sans redemander le verdict).
  Corrigé en route : la consigne « batteries » s'affichait pour les batteries d'échange d'une climatisation ;
  `/tests/` renvoyait une erreur 404 (il fallait `/tests/index.html`).
