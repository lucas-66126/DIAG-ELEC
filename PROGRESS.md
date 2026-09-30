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
