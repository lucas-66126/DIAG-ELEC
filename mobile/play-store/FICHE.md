# DIAG-MAINT — fiche Play Store (à copier dans la Play Console)

## Identité

| Champ | Valeur proposée |
|---|---|
| Nom de l'application (30 caractères max) | DIAG-MAINT : diagnostic pannes |
| Identifiant (définitif après la première publication) | `com.cadrio.diagmaint` |
| Langue par défaut | Français (France) |
| Catégorie | Outils (ou Professionnel) |
| Type | Application, gratuite |
| Politique de confidentialité | https://lucas-66126.github.io/DIAG-ELEC/confidentialite.html |

## Description courte (80 caractères max)

Diagnostic de pannes pas à pas pour techniciens de maintenance, même hors ligne.

## Description complète (4000 caractères max)

DIAG-MAINT accompagne le technicien de maintenance pendant une recherche de panne, comme le ferait un collègue
expérimenté : il pose une question à la fois, propose le contrôle le plus utile et le plus sûr, tient compte de
chaque mesure et ne conclut que sur une preuve.

DOMAINES COUVERTS
• Électricité et distribution, régime IT
• Armoires de commande, contacteurs, relais thermiques
• Moteurs et variateurs
• Pompes, surpresseurs, relevage
• Climatisation, pompes à chaleur, chauffage, ventilation
• Automatisme, capteurs, automates
• Contrôle d'accès, portails, interphonie
• Sécurité incendie (SSI, détection, éclairage de sécurité)
• Maintenance industrielle : pneumatique, hydraulique, transmissions

CE QUE FAIT L'APPLICATION
• Diagnostic guidé : symptôme → hypothèses → contrôle → résultat → diagnostic
• 170 causes de panne, chacune avec ses contrôles et la réparation conseillée
• Rappels de sécurité avant chaque contrôle : consignation, mesure sous tension, niveau de risque
• Relevé des mesures horodaté, photos, pièces remplacées
• Rapport d'intervention prêt à partager
• Historique des diagnostics, recherche des pannes similaires
• Fonctionne entièrement hors connexion : vos données restent sur votre téléphone

ASSISTANT IA (FACULTATIF)
Si vous disposez d'un serveur DIAG-MAINT, l'application peut dialoguer avec un assistant d'intelligence
artificielle qui raisonne sur votre panne, lit vos photos et vos notices. Sans serveur, le moteur intégré
fonctionne seul.

IMPORTANT
DIAG-MAINT est une aide au diagnostic. Le technicien reste responsable de ses conclusions et du respect des règles
de sécurité : habilitation, consignation, consignes du site. Les interventions électriques, frigorifiques ou sur
des systèmes de sécurité incendie sont réservées aux personnes qualifiées.

## Images fournies dans ce dossier

- `icone-512.png` : icône de la fiche (512 × 512)
- `bandeau-1024x500.png` : image de présentation (1024 × 500)
- Captures d'écran du téléphone : au moins 2, à prendre sur l'application installée (accueil, conversation, rapport)

## Formulaires de la Play Console (réponses préparées)

**Sécurité des données**
- L'application collecte-t-elle ou partage-t-elle des données ? Sans serveur IA : non, tout reste sur l'appareil.
  Avec un serveur IA configuré par l'utilisateur : le contenu des diagnostics et les photos jointes sont envoyés à ce
  serveur pour produire la réponse (traitement, pas de publicité ni de revente). À déclarer comme
  « Photos » et « Autre contenu généré par l'utilisateur », finalité « Fonctionnement de l'application », facultatif.
- Données chiffrées en transit : oui (HTTPS) si le serveur est hébergé en HTTPS.
- L'utilisateur peut demander la suppression : oui, depuis Réglages → Effacer toutes les données.

**Classification du contenu** : questionnaire « Utilitaires / productivité », aucun contenu sensible → tous publics.

**Public cible** : 18 ans et plus (outil professionnel).

**Publicités** : non.

**Accès à l'application** : aucune restriction, pas de compte.

## Étapes dans la Play Console

1. Créer le compte développeur (25 $ une fois, vérification d'identité).
2. Créer l'application, remplir la fiche avec les textes ci-dessus.
3. Remplir les formulaires : confidentialité, sécurité des données, classification, public cible.
4. Test fermé : importer le fichier `.aab` signé, inviter les testeurs (compte personnel récent : 12 testeurs
   pendant 14 jours avant de pouvoir demander la mise en production).
5. Demander l'accès à la production, puis publier.
