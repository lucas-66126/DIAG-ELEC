/* DIAG-MAINT — base de connaissances : types d'installation, symptômes courants, hypothèses types.
 * Les mots-clés sont écrits en minuscules sans accents ; ils sont comparés au début des mots
 * de la description et des symptômes (ex. "disjonct" reconnaît "disjoncte", "disjoncteur"). */
(function (DM) {
  'use strict';

  DM.INSTALL_TYPES = [
    { id: 'electricite', label: 'Électricité / distribution', icon: 'bolt' },
    { id: 'electrotechnique', label: 'Électrotechnique / armoire', icon: 'cabinet' },
    { id: 'hvac', label: 'Climatisation / HVAC', icon: 'snow' },
    { id: 'automatisme', label: 'Automatisme / API', icon: 'cpu' },
    { id: 'moteur', label: 'Moteur électrique', icon: 'motor' },
    { id: 'pompe', label: 'Pompe', icon: 'pump' },
    { id: 'acces', label: 'Contrôle d’accès', icon: 'key' },
    { id: 'incendie', label: 'Sécurité incendie', icon: 'flame' },
    { id: 'industriel', label: 'Maintenance industrielle', icon: 'factory' },
    { id: 'autre', label: 'Autre', icon: 'wrench' }
  ];
  DM.installType = function (id) {
    return DM.INSTALL_TYPES.find(function (t) { return t.id === id; }) || DM.INSTALL_TYPES[DM.INSTALL_TYPES.length - 1];
  };

  const COMMON_SYMPTOMS = ['Ne démarre pas', 'S’arrête en fonctionnement', 'Fonctionnement intermittent', 'Code défaut affiché', 'Bruit anormal', 'Odeur de brûlé'];
  DM.SYMPTOM_CHIPS = {
    electricite: ['Disjoncteur qui déclenche', 'Différentiel qui déclenche', 'Plus de courant sur le circuit', 'Échauffement / odeur'],
    electrotechnique: ['Contacteur ne colle pas', 'Relais thermique déclenché', 'Voyant défaut allumé', 'Arrêt d’urgence actif'],
    hvac: ['Ne refroidit pas', 'Ne chauffe pas', 'Givre sur l’évaporateur', 'Fuite d’eau', 'Compresseur ne démarre pas', 'Haute pression'],
    automatisme: ['Cycle bloqué', 'Capteur non détecté', 'Automate en STOP / défaut', 'Perte de communication'],
    moteur: ['Moteur chauffe', 'Moteur bourdonne sans tourner', 'Vibrations', 'Disjoncte au démarrage'],
    pompe: ['Débit faible', 'Pas de débit', 'Fuite au niveau de l’arbre', 'Bruit de cavitation', 'Marche en continu'],
    acces: ['Badge refusé', 'Porte ne s’ouvre pas', 'Porte ne se verrouille pas', 'Lecteur éteint', 'Centrale hors ligne'],
    incendie: ['Dérangement ligne', 'Alarme intempestive', 'Défaut alimentation / batterie', 'Défaut DAS'],
    industriel: ['Machine bloquée', 'Vibrations', 'Pression pneumatique faible', 'Fuite d’huile', 'Défaut sécurité machine'],
    autre: []
  };
  DM.symptomChips = function (type) { return (DM.SYMPTOM_CHIPS[type] || []).concat(COMMON_SYMPTOMS); };

  /**
   * Contrôle type. opts.localize : contrôle de localisation — un résultat conforme ne contredit pas l'hypothèse,
   * il resserre la zone de recherche (opts.onConform décrit ce qu'on en déduit).
   */
  function C(type, description, expected, why, opts) {
    return Object.assign({ type: type, description: description, expected: expected, why: why || '' }, opts || {});
  }

  /* Régime IT : méthode de recherche d'un défaut d'isolement signalé par le CPI. */
  const FEEDER_TEST = C('fonctionnel',
    'Pendant que le défaut est présent (pré-alarme ou alarme), ouvrir successivement les départs du tableau principal un par un, en notant la valeur du CPI à chaque ouverture, puis refermer.',
    'Aucun départ ne fait remonter nettement le CPI (sinon : le départ qui le fait remonter porte le défaut).',
    'Identifier le départ en défaut sans rien démonter ; en IT, le premier défaut ne fait pas déclencher, on peut chercher en exploitation.',
    { localize: true, feederTest: true, onConform: 'Aucun départ ne se détache : défaut en amont (TGBT) ou multiple.' });
  function isolationFault() {
    return H('Défaut d’isolement sur un départ (humidité, condensation, infiltration)',
      'Un défaut d’isolement qui apparaît la nuit et le matin, s’aggrave après la pluie et disparaît quand il fait sec et chaud est typique d’une humidité ou d’une condensation dans une boîte de jonction, un câble ou un presse-étoupe. En IT, ce premier défaut doit être éliminé avant qu’un second défaut sur une autre phase ne provoque un court-circuit.',
      ['cpi', 'controleur permanent', 'isolement', 'regime it', 'pre alarme', 'alarme', 'humid', 'pluie', 'matin', 'nuit', 'condensation', 'rosee', 'sec', 'intermitten', 'exterieur', 'fosse'],
      [FEEDER_TEST,
       C('hors_tension', 'Départ en défaut consigné : mesurer l’isolement du récepteur seul (moteur, appareil), câble débranché, au mégohmmètre (tension d’essai adaptée).', 'Isolement élevé (> 1 MΩ, typiquement plusieurs centaines de MΩ pour un moteur sain).',
         'Séparer le récepteur du câble : savoir si le défaut est dans l’appareil ou dans la liaison.',
         { localize: true, onConform: 'Récepteur sain : le défaut est dans le câble ou ses connexions.' }),
       C('hors_tension', 'Départ consigné : mesurer l’isolement du câble complet phase par phase (du tableau jusqu’au récepteur), de préférence au moment où le défaut est présent.', 'Chaque phase > 1 MΩ par rapport à la terre.',
         'Identifier la phase en défaut et confirmer que le câble est en cause.',
         { localize: true, onConform: 'Câble sain au moment de la mesure : refaire la mesure quand le défaut est présent (tôt le matin).' }),
       C('sous_tension', 'Localiser le défaut le long du câble avec le générateur de recherche et la pince : suivre le signal (coffrets, boîtes de jonction, traversées).', 'Signal suivi jusqu’au récepteur sans disparition anormale (sinon : le défaut est à l’endroit où le signal disparaît).',
         'Trouver l’endroit précis du défaut avant d’ouvrir quoi que ce soit.',
         { localize: true, onConform: 'Pas de point de disparition du signal : défaut probablement dans le récepteur ou diffus.' }),
       C('visuel', 'Point localisé consigné : inspecter la boîte de jonction / le coffret (étanchéité, presse-étoupes, joints, condensation, oxydation des bornes).', 'Boîte étanche, sèche, bornes propres.',
         'Constater la cause physique du défaut avant de réparer.')],
      'Départ consigné : sécher et nettoyer la boîte de jonction, remplacer les bornes oxydées, le joint et le presse-étoupe (indice IP adapté à l’extérieur), ' +
      'puis refaire la mesure d’isolement du câble — idéalement au moment où le défaut apparaissait (tôt le matin, après une nuit humide) — et suivre la valeur du CPI les jours suivants.');
  }
  /** Hypothèse type. advice : réparation conseillée une fois la cause confirmée (facultatif). */
  function H(cause, reason, keywords, controls, advice) { return { cause: cause, reason: reason, keywords: keywords, controls: controls, advice: advice || '' }; }

  /* Déclenchements thermiques d'un moteur : la mesure du courant sur CHAQUE phase en régime établi départage
   * une surcharge mécanique (3 phases chargées) d'un défaut électrique localisé (une phase plus chargée). */
  const PHASE_CURRENTS = C('sous_tension',
    'Mesurer l’intensité sur chaque phase (L1, L2, L3) en régime établi, après 30 à 40 min de marche, à la pince ampèremétrique.',
    'Trois courants proches (écart < 10 %) et inférieurs ou égaux à l’intensité nominale de la plaque.',
    'Distinguer une surcharge mécanique (trois phases chargées) d’un défaut électrique localisé (une phase plus chargée).');
  function contactDegrade() {
    return H('Contact de contacteur dégradé (pôle résistant)',
      'Un pôle usé ou mal serré présente une résistance de contact : il chauffe, crée un déséquilibre de courant et fait déclencher le relais thermique, d’autant plus que l’armoire est chaude.',
      ['thermique', 'intermitten', 'apres midi', 'chaleur', 'ete', 'etoile', 'triangle', 'contacteur', 'desequilibr', 'echauff', 'disjonct', 's arrete'],
      [PHASE_CURRENTS,
       C('sous_tension', 'Thermographie de l’armoire en charge : contacteurs, relais thermique, borniers.', 'Écart inférieur à 10 °C entre pôles comparables.',
         'Repérer le point de connexion ou le pôle qui chauffe.'),
       C('sous_tension', 'Mesurer en charge la chute de tension aux bornes de chaque pôle des contacteurs concernés (voltmètre, calibre adapté).', 'Quelques dizaines de mV, identique sur les trois pôles.',
         'Confirmer un pôle résistant avant de remplacer le contacteur.')],
      'Circuit consigné : remplacer le contacteur en cause (pas seulement le pôle), contrôler le serrage de ses connexions au couple, ' +
      'puis refaire la mesure du courant par phase en charge et une thermographie après 40 minutes de marche. Ne pas augmenter le réglage du relais thermique pour « tenir ».');
  }

  const KB = {
    electricite: [
      isolationFault(),
      H('Courants de fuite capacitifs d’un variateur (filtre CEM)', 'Le filtre CEM d’un variateur (condensateurs vers la terre) crée des fuites capacitives qui abaissent la valeur lue par le CPI ; un variateur récent est souvent soupçonné.',
        ['variateur', 'cem', 'filtre', 'recent', 'installe', 'cpi', 'isolement'],
        [FEEDER_TEST,
         C('visuel', 'Vérifier dans la notice du variateur si le filtre CEM doit être déconnecté en régime IT (cavalier / vis de mise à la terre du filtre).', 'Filtre CEM configuré pour un réseau IT.',
           'En IT, un filtre CEM raccordé à la terre fausse la surveillance d’isolement.')]),
      H('Défaut d’isolement de résistances chauffantes', 'Les résistances chauffantes (chauffage, antigel) sont une cause classique de défaut d’isolement, surtout après une période d’arrêt humide.',
        ['chauffage', 'resistance', 'radiateur', 'antigel', 'isolement', 'cpi'],
        [FEEDER_TEST,
         C('hors_tension', 'Départ du chauffage consigné : mesurer l’isolement des résistances au mégohmmètre.', 'Isolement > 1 MΩ.',
           'Écarter ou confirmer les résistances chauffantes.')]),
      H('Surcharge du circuit', 'Un courant absorbé supérieur au calibre provoque le déclenchement thermique de la protection.',
        ['disjonct', 'saute', 'declench', 'surcharge', 'chauffe', 'apres un moment'],
        [C('sous_tension', 'Mesurer le courant absorbé sur le circuit à la pince ampèremétrique, en charge.', 'Courant inférieur au calibre du disjoncteur (In).')]),
      H('Défaut d’isolement', 'Un courant de fuite vers la terre (humidité, câble ou récepteur endommagé) fait déclencher le différentiel.',
        ['differentiel', 'disjonct', 'humid', 'eau', 'pluie', 'fuite', 'declench', 'terre'],
        [C('hors_tension', 'Mesurer la résistance d’isolement (mégohmmètre 500 V DC) entre conducteurs actifs et PE, récepteurs débranchés.', '≥ 0,5 MΩ (NF C 15-100), idéalement > 1 MΩ.')]),
      H('Court-circuit', 'Un déclenchement immédiat à la mise sous tension oriente vers un court-circuit franc.',
        ['court', 'immediat', 'instantane', 'flash', 'etincel', 'arc', 'brul'],
        [C('hors_tension', 'Mesurer la résistance entre phase et neutre et entre phases (ohmmètre), charges débranchées.', 'Résistance élevée (circuit ouvert), aucune valeur proche de 0 Ω.')]),
      H('Connexion desserrée / échauffement', 'Un mauvais serrage crée une résistance de contact, un échauffement et des coupures aléatoires.',
        ['chauffe', 'odeur', 'brul', 'noirci', 'intermittent', 'gresill', 'clignot', 'aleatoire'],
        [C('visuel', 'Consigner puis inspecter bornes et connexions (traces d’échauffement, isolant fondu) et contrôler le serrage au couple.', 'Aucune trace d’échauffement, serrage conforme au couple constructeur.'),
         C('sous_tension', 'Réaliser une thermographie infrarouge des connexions en charge.', 'Écart < 10 °C entre connexions comparables.')]),
      H('Absence de tension en amont', 'L’équipement n’est peut-être simplement pas alimenté (protection amont ouverte, coupure réseau).',
        ['plus de courant', 'pas de courant', 'pas de tension', 'aucun', 'eteint', 'coupure', 'ne fonctionne', 'hors service'],
        [C('sous_tension', 'Mesurer la tension en amont et en aval de la protection (multimètre CAT III).', '230 V ph-N / 400 V ph-ph ±10 %.')]),
      H('Appareil de protection défectueux', 'Une protection vieillissante peut déclencher sans défaut réel ou refuser de se réarmer.',
        ['disjonct', 'rearm', 'bloque', 'differentiel', 'ne tient pas'],
        [C('fonctionnel', 'Réarmer hors charge puis tester le bouton test du différentiel ; si possible, mesurer le seuil et le temps de déclenchement.', 'Réarmement possible ; déclenchement au bouton test ; seuil entre 0,5 et 1 × IΔn.')])
    ],
    electrotechnique: [
      contactDegrade(),
      H('Défaut du circuit de commande', 'Sans tension de commande (fusible, transformateur, alimentation), aucun organe ne peut être piloté.',
        ['ne demarre', 'commande', 'voyant', 'rien ne se passe', 'pas de reaction', 'aucune reaction', 'eteint'],
        [C('sous_tension', 'Mesurer la tension au secondaire du transformateur de commande et en aval des fusibles de commande.', 'Tension nominale (ex. 24 V AC/DC ou 230 V AC).')]),
      H('Contacteur défaillant (bobine ou contacts)', 'Une bobine coupée ou des contacts usés/soudés empêchent la mise en marche ou l’arrêt.',
        ['contacteur', 'colle', 'claque', 'vibre', 'bruit', 'ne demarre', 'ne s arrete'],
        [C('hors_tension', 'Mesurer la résistance de la bobine du contacteur.', 'Valeur conforme au constructeur (ni 0 Ω, ni circuit ouvert).'),
         C('visuel', 'Contrôler l’état des contacts de puissance (usure, cratères, soudure).', 'Contacts propres, sans soudure.')]),
      H('Relais thermique déclenché', 'Le relais de protection moteur a pu déclencher suite à une surcharge ou être mal réglé.',
        ['thermique', 'declench', 'surcharge', 's arrete', 'chauffe', 'defaut'],
        [C('visuel', 'Vérifier l’état du relais thermique et comparer son réglage au courant nominal de la plaque moteur.', 'Relais armé ; réglage = In moteur.')]),
      H('Chaîne de sécurité ouverte', 'Un arrêt d’urgence, une fin de course ou un contact de porte ouvert interrompt la commande.',
        ['arret d urgence', 'securite', 'ne demarre', 'defaut', 'porte', 'fin de course'],
        [C('hors_tension', 'Contrôler la continuité de la chaîne de sécurité (AU, fins de course, contacts de porte, relais de sécurité).', 'Continuité sur toute la chaîne.')]),
      H('Défaut de câblage / bornier', 'Un défaut intermittent évoque un conducteur desserré ou endommagé.',
        ['intermittent', 'aleatoire', 'parfois', 'vibration', 'de temps en temps'],
        [C('hors_tension', 'Contrôler le serrage des borniers et la continuité des conducteurs de commande en les sollicitant.', 'Serrage correct, continuité stable.')])
    ],
    hvac: [
      H('Surintensité : consommation excessive de l’unité extérieure', 'Un déclenchement de la protection magnétothermique seule (sans le différentiel) après quelques minutes de fonctionnement oriente vers une intensité absorbée trop élevée (compresseur en difficulté, haute pression, ventilateur).',
        ['disjonct', 'declench', 'saute', 'surintensit', 'minutes', 'apres quelques', 'c16', 'c20', 'c25', 'c32', 'protection'],
        [C('sous_tension', 'Mesurer l’intensité absorbée par l’unité extérieure pendant son fonctionnement (pince ampèremétrique sur la phase d’alimentation).', 'Inférieure ou égale à l’intensité maximale indiquée sur la plaque signalétique / la notice.'),
         C('visuel', 'Unité consignée : contrôler la propreté du condenseur et la rotation libre du ventilateur extérieur.', 'Batterie propre, ventilateur libre.')]),
      H('Manque de fluide frigorigène (fuite)', 'Une charge insuffisante réduit la puissance frigorifique et provoque givrage / basse pression.',
        ['ne refroidit', 'froid insuffisant', 'pas de froid', 'givre', 'glace', 'fuite', 'bulle', 'basse pression', 'bp', 'ne chauffe'],
        [C('fluide', 'Relever les pressions HP/BP au manifold, calculer surchauffe et sous-refroidissement.', 'Valeurs conformes au constructeur (surchauffe typique 5 à 8 K).'),
         C('fluide', 'Rechercher une fuite (détecteur électronique, bulles, traces d’huile aux raccords).', 'Aucune fuite détectée.')]),
      H('Filtres ou échangeurs encrassés', 'L’encrassement réduit le débit d’air et l’échange thermique (givrage, haute pression).',
        ['debit', 'faible', 'souffle', 'sale', 'poussiere', 'odeur', 'givre', 'encrass', 'haute pression', 'hp'],
        [C('visuel', 'Contrôler l’état des filtres et des batteries (évaporateur / condenseur).', 'Filtres propres, ailettes dégagées.')]),
      H('Condensateur de démarrage / permanent défaillant', 'Un condensateur hors tolérance empêche le démarrage du compresseur ou du ventilateur.',
        ['ne demarre', 'compresseur', 'ventilateur', 'bourdonne', 'ronfle', 'claque', 'demarre pas'],
        [C('hors_tension', 'Décharger puis mesurer la capacité du condensateur (capacimètre).', 'Capacité dans la tolérance (±5 à 10 % de la valeur marquée).')]),
      H('Défaut de sonde ou de régulation', 'Une sonde dérivée ou coupée fausse la régulation ou provoque un code défaut.',
        ['temperature', 'consigne', 'affiche', 'code', 'erreur', 'defaut', 'sonde', 'regul', 'e1', 'e2'],
        [C('hors_tension', 'Déconnecter la sonde et mesurer sa résistance ; comparer à la table R/T constructeur (ex. CTN 10 kΩ à 25 °C).', 'Valeur conforme à la table R/T à la température mesurée.')]),
      H('Moto-ventilateur défectueux', 'Un ventilateur à l’arrêt ou lent provoque haute pression (condenseur) ou givrage (évaporateur).',
        ['ventilateur', 'bruit', 'vibration', 'ne tourne', 'chauffe', 'haute pression', 'hp'],
        [C('sous_tension', 'Vérifier la rotation du ventilateur et mesurer son intensité absorbée.', 'Rotation libre, intensité ≤ valeur plaque.')]),
      H('Évacuation des condensats obstruée', 'Un bac ou une évacuation bouchée provoque un débordement d’eau.',
        ['fuite', 'eau', 'goutte', 'condensat', 'coule', 'deborde'],
        [C('visuel', 'Contrôler le bac, la pompe de relevage et la pente de l’évacuation des condensats.', 'Écoulement libre, pompe fonctionnelle.')]),
      H('Compresseur en défaut (protection thermique / bobinage)', 'Des arrêts répétés ou un compresseur qui ne démarre pas peuvent venir de ses enroulements.',
        ['compresseur', 's arrete', 'coupe', 'chauffe', 'intermittent', 'disjonct'],
        [C('hors_tension', 'Mesurer les résistances des enroulements (C-S, C-R, S-R) et l’isolement à la masse.', 'R(S-R) = R(C-S) + R(C-R) ; isolement > 1 MΩ.')])
    ],
    automatisme: [
      H('Entrée automate non vue', 'Si l’API ne voit pas l’information, le cycle reste en attente.',
        ['capteur', 'detecteur', 'entree', 'led', 'ne detecte', 'cycle bloque', 'attente', 'bloque'],
        [C('sous_tension', 'Observer la LED d’entrée de l’API et mesurer la tension à la borne d’entrée en actionnant le capteur.', 'Changement d’état 0 V ↔ 24 V DC et LED correspondante.')]),
      H('Capteur déréglé ou défectueux', 'Un capteur mal positionné, sale ou en fin de vie donne une détection instable.',
        ['capteur', 'detecteur', 'intermittent', 'parfois', 'cellule', 'fin de course', 'aleatoire'],
        [C('fonctionnel', 'Contrôler la détection du capteur (distance, alignement, propreté, LED du capteur).', 'Détection franche et répétable.')]),
      H('Défaut d’alimentation 24 V', 'Une alimentation faible ou surchargée provoque des redémarrages et défauts aléatoires.',
        ['24', 'alimentation', 'api', 'automate', 'eteint', 'reset', 'redemarre', 'stop'],
        [C('sous_tension', 'Mesurer la tension 24 V DC en sortie d’alimentation, à vide puis en charge.', '24 V DC ±5 %, stable en charge.')]),
      H('Sortie automate ou actionneur défaillant', 'La sortie peut être active sans que l’actionneur ne réagisse (bobine, câblage, distributeur).',
        ['sortie', 'verin', 'electrovanne', 'actionneur', 'ne bouge', 'distributeur'],
        [C('sous_tension', 'Activer/observer la sortie API et mesurer la tension aux bornes de l’actionneur.', '24 V présents lorsque la sortie est active.')]),
      H('Défaut de communication réseau', 'Une perte de liaison bloque les échanges entre API, IHM, variateurs ou E/S déportées.',
        ['communication', 'reseau', 'bus', 'profinet', 'modbus', 'ethernet', 'hmi', 'ihm', 'timeout', 'perte'],
        [C('visuel', 'Contrôler câbles et connecteurs réseau, LED de diagnostic, adresses et diagnostic API.', 'Liaison établie, aucune erreur bus.')]),
      H('Programme ou paramètre modifié', 'Une modification récente peut avoir introduit un comportement anormal.',
        ['depuis la mise a jour', 'modif', 'mise a jour', 'parametre', 'recette', 'apres intervention', 'apres l intervention'],
        [C('fonctionnel', 'Comparer le programme et les paramètres avec la dernière sauvegarde de référence.', 'Aucune différence non documentée.')])
    ],
    moteur: [
      contactDegrade(),
      H('Réglage du relais thermique inadapté', 'Un réglage trop bas (ou qui ne tient pas compte du montage : In/√3 s’il est placé dans le triangle d’un étoile-triangle) provoque des déclenchements sans défaut réel.',
        ['thermique', 'etoile', 'triangle', 'reglage', 'regle', 'relais'],
        [C('visuel', 'Comparer le réglage du relais thermique au courant qu’il surveille (plaque moteur ; In/√3 ≈ 0,58 × In s’il est placé dans le triangle).', 'Réglage cohérent avec le courant surveillé, sans marge excessive ni insuffisante.',
          'Écarter une cause simple, sans risque, avant de mesurer.')]),
      H('Échauffement de l’armoire (température ambiante)', 'Le relais thermique est sensible à la température de l’armoire : par forte chaleur il déclenche plus tôt, surtout si le moteur est déjà proche de sa limite.',
        ['apres midi', 'chaleur', 'ete', 'temperature', 'atelier', 'ventilation'],
        [C('fluide', 'Mesurer la température intérieure de l’armoire l’après-midi et contrôler sa ventilation (filtres, ventilateur).', 'Température compatible avec la notice du relais (souvent ≤ 40 °C), ventilation fonctionnelle.',
          'Vérifier si la chaleur aggrave un défaut existant.')]),
      H('Défaut d’alimentation (perte de phase)', 'Une phase manquante fait bourdonner le moteur sans démarrer et provoque un échauffement.',
        ['ne demarre', 'bourdonne', 'ronfle', 'chauffe', 'phase', 'lent', 'disjonct'],
        [C('sous_tension', 'Mesurer les tensions entre phases aux bornes du moteur.', 'Trois tensions présentes et équilibrées (écart < 2 %).')]),
      H('Défaut d’isolement du bobinage', 'Un bobinage humide ou dégradé provoque des déclenchements différentiels.',
        ['disjonct', 'differentiel', 'humid', 'odeur', 'brul', 'declench', 'eau'],
        [C('hors_tension', 'Moteur déconnecté, mesurer l’isolement des enroulements par rapport à la masse (mégohmmètre 500 V DC).', '> 1 MΩ (> 100 MΩ pour un moteur sain).')]),
      H('Enroulement coupé ou déséquilibré', 'Un enroulement défectueux crée un déséquilibre, un échauffement et des déclenchements thermiques.',
        ['chauffe', 'bourdonne', 'ne demarre', 'thermique', 'declench'],
        [C('hors_tension', 'Mesurer la résistance de chaque enroulement (U1-U2, V1-V2, W1-W2).', 'Valeurs identiques à ±5 %.')]),
      H('Roulements usés', 'Bruit, vibration et échauffement côté paliers sont typiques d’une usure de roulements.',
        ['bruit', 'vibration', 'chauffe', 'grince', 'siffle', 'claque', 'roulement'],
        [C('visuel', 'Moteur consigné : tourner l’arbre à la main, contrôler jeu et bruit ; mesure vibratoire si disponible.', 'Rotation libre, sans point dur ni jeu.')]),
      H('Surcharge mécanique', 'Une charge entraînée trop importante ou grippée (bande trop tendue, roulement, réducteur) fait déclencher le relais thermique.',
        ['thermique', 'declench', 's arrete', 'chauffe', 'force', 'lent', 'bloque', 'bande', 'retendu', 'roulement', 'reducteur'],
        [PHASE_CURRENTS,
         C('visuel', 'Machine consignée : tourner l’arbre à la main, contrôler roulements, tension de bande et réducteur.', 'Rotation libre, sans point dur.',
           'Rechercher une résistance mécanique anormale.')]),
      H('Couplage incorrect', 'Après un remplacement, un mauvais couplage étoile/triangle donne un moteur lent ou qui chauffe.',
        ['apres remplacement', 'neuf', 'inverse', 'sens', 'couplage', 'lent', 'remplace'],
        [C('hors_tension', 'Vérifier le couplage (étoile/triangle) par rapport à la tension réseau et à la plaque.', 'Couplage conforme à la plaque.')]),
      H('Variateur en défaut', 'Le variateur peut bloquer le moteur et afficher un code défaut.',
        ['variateur', 'code', 'defaut', 'erreur', 'affiche', 'vitesse'],
        [C('visuel', 'Relever le code défaut et l’historique du variateur ; consulter la notice.', 'Aucun défaut actif, ou défaut identifié.')])
    ],
    pompe: [
      H('Désamorçage / prise d’air à l’aspiration', 'Une entrée d’air ou un niveau trop bas fait chuter le débit.',
        ['pas de debit', 'debit faible', 'desamorc', 'air', 'bruit', 'aspiration'],
        [C('visuel', 'Contrôler le niveau d’aspiration, le clapet de pied et l’étanchéité de l’aspiration.', 'Pompe amorcée, aspiration étanche.')]),
      H('Crépine ou filtre colmaté', 'Un colmatage à l’aspiration limite le débit et peut provoquer la cavitation.',
        ['debit', 'faible', 'pression basse', 'bouche', 'colmat'],
        [C('visuel', 'Consigner la pompe, isoler hydrauliquement, inspecter et nettoyer crépine et filtre.', 'Crépine et filtre propres.')]),
      H('Cavitation', 'Un bruit de « gravier » et des vibrations indiquent une pression d’aspiration insuffisante.',
        ['bruit', 'gravier', 'vibration', 'cavitation', 'crepit'],
        [C('fluide', 'Mesurer la pression à l’aspiration et comparer NPSH disponible / requis.', 'NPSH disponible > NPSH requis + marge.')]),
      H('Garniture mécanique usée', 'Une fuite au niveau de l’arbre indique une garniture ou une tresse usée.',
        ['fuite', 'goutte', 'eau', 'garniture', 'etancheite', 'arbre'],
        [C('visuel', 'Inspecter la garniture mécanique ou la tresse (fuite le long de l’arbre).', 'Pas de fuite (ou fuite admise pour une tresse).')]),
      H('Roue usée ou obstruée', 'Une roue usée ou encombrée ne fournit plus la hauteur manométrique nominale.',
        ['debit', 'faible', 'pression', 'hauteur', 'usure', 'vibration'],
        [C('fluide', 'Relever pression au refoulement et débit ; comparer à la courbe constructeur.', 'Point de fonctionnement sur la courbe.')]),
      H('Sens de rotation inversé', 'Après intervention électrique, une inversion de phases fait tourner la pompe à l’envers.',
        ['apres intervention', 'sens', 'debit faible', 'neuf', 'inverse', 'remplace'],
        [C('fonctionnel', 'Vérifier le sens de rotation (flèche sur le corps de pompe) par une brève impulsion.', 'Rotation dans le sens de la flèche.')]),
      H('Défaut de commande (pressostat / flotteur / niveau)', 'Une commande défaillante provoque marche continue, courts cycles ou absence de démarrage.',
        ['ne demarre', 'ne s arrete', 'continu', 'court cycle', 'pressostat', 'flotteur', 'niveau'],
        [C('fonctionnel', 'Contrôler le fonctionnement du pressostat / flotteur / capteur de niveau aux seuils réglés.', 'Changement d’état aux seuils réglés.')])
    ],
    acces: [
      H('Défaut d’alimentation ou batterie', 'Un lecteur éteint ou une centrale muette évoquent un problème d’alimentation.',
        ['rien', 'eteint', 'ne fonctionne', 'coupure', 'batterie', 'led', 'hors service'],
        [C('sous_tension', 'Mesurer la tension d’alimentation de la centrale / du lecteur (12 ou 24 V DC) et la tension batterie.', 'Tension nominale ; batterie 12 V > 12,4 V.')]),
      H('Gâche ou ventouse défectueuse', 'L’organe de verrouillage peut ne plus recevoir ou ne plus exécuter l’ordre.',
        ['porte', 'ne s ouvre', 'ne se ferme', 'reste', 'gache', 'ventouse', 'verrouill'],
        [C('sous_tension', 'Mesurer la tension aux bornes de la gâche / ventouse lors d’un accès autorisé.', 'Commande présente au moment de l’accès.'),
         C('hors_tension', 'Mesurer la résistance de la bobine de la gâche / ventouse.', 'Valeur conforme (ni 0 Ω, ni circuit ouvert).')]),
      H('Lecteur ou badge défectueux', 'Un seul badge refusé oriente vers le badge ; tous refusés vers le lecteur.',
        ['badge', 'lecteur', 'refuse', 'carte', 'bip', 'ne lit'],
        [C('fonctionnel', 'Tester avec un badge de référence valide et consulter le journal d’événements.', 'Lecture OK et événement enregistré.')]),
      H('Droits ou paramétrage incorrects', 'Un refus ciblé (personne, horaire, porte) évoque un paramétrage logiciel.',
        ['refuse', 'acces refuse', 'horaire', 'droit', 'certain', 'utilisateur'],
        [C('fonctionnel', 'Vérifier les droits, plages horaires et la validité du badge dans le logiciel.', 'Droits conformes à la demande.')]),
      H('Perte de communication avec la centrale', 'Un équipement hors ligne ne reçoit plus les droits ni ne remonte les événements.',
        ['hors ligne', 'communication', 'reseau', 'bus', 'offline', 'rs485'],
        [C('visuel', 'Contrôler le bus (RS485 / Ethernet), la terminaison, l’adressage et les LED de communication.', 'Équipement en ligne.')]),
      H('Contact de porte ou bouton de sortie défaillant', 'Des alarmes « porte forcée / ouverte » viennent souvent du contact de position.',
        ['alarme', 'porte forcee', 'porte ouverte', 'bouton', 'sortie'],
        [C('fonctionnel', 'Contrôler le changement d’état du contact de position de porte et du bouton de sortie.', 'Changement d’état franc à chaque manœuvre.')])
    ],
    incendie: [
      H('Détecteur encrassé ou défectueux', 'Les alarmes intempestives proviennent souvent d’un détecteur sale ou en fin de vie.',
        ['detecteur', 'feu', 'alarme', 'intempestif', 'derangement', 'poussiere'],
        [C('fonctionnel', 'Identifier le point en alarme/dérangement ; nettoyer et tester le détecteur (aérosol de test).', 'Réaction à l’essai et retour au repos après réarmement.')]),
      H('Ligne de détection en défaut (coupure / court-circuit)', 'Un dérangement de zone évoque une ligne coupée, en court-circuit ou une RFL absente.',
        ['derangement', 'ligne', 'boucle', 'zone', 'court', 'coupure', 'defaut'],
        [C('hors_tension', 'Déconnecter la ligne et mesurer sa résistance avec la résistance de fin de ligne.', 'Valeur égale à la RFL (ex. 4,7 kΩ) aux tolérances près.')]),
      H('Défaut d’alimentation / batteries', 'Un défaut secteur ou batterie est signalé par l’ECS ou l’AES.',
        ['batterie', 'secteur', 'alimentation', 'aes', 'defaut alim'],
        [C('sous_tension', 'Mesurer la tension secteur, la tension de charge et la tension des batteries de l’AES.', 'Charge ≈ 27,3 V pour un système 24 V ; batteries de moins de 4 ans.')]),
      H('Déclencheur manuel défectueux ou actionné', 'Un DM actionné ou endommagé maintient une alarme.',
        ['declencheur', 'dm', 'bris de glace', 'alarme'],
        [C('visuel', 'Contrôler l’état et la position du déclencheur manuel (membrane, réarmement).', 'DM au repos, membrane intacte.')]),
      H('Défaut de DAS / asservissement', 'Un DAS qui ne revient pas en position ou n’envoie pas sa fin de course crée un défaut.',
        ['porte coupe feu', 'clapet', 'volet', 'desenfumage', 'das', 'ventouse', 'asservissement'],
        [C('fonctionnel', 'Contrôler position, fin de course et commande du DAS (en accord avec l’exploitant).', 'DAS en sécurité à l’ordre, retour de position correct.')]),
      H('Défaut d’isolement de ligne (défaut terre)', 'Un défaut terre signalé par l’ECS vient d’une ligne humide ou blessée.',
        ['defaut terre', 'terre', 'isolement', 'humid'],
        [C('hors_tension', 'Mesurer l’isolement de la ligne par rapport à la terre.', '> 1 MΩ.')])
    ],
    industriel: [
      H('Usure ou défaut mécanique', 'Bruits, jeux et vibrations orientent vers une pièce mécanique usée.',
        ['bruit', 'vibration', 'jeu', 'claque', 'grince', 'usure', 'casse'],
        [C('visuel', 'Machine consignée : contrôler jeux, roulements, courroies et accouplements.', 'Aucun jeu anormal, éléments en bon état.')]),
      H('Défaut de lubrification', 'Un manque de lubrification provoque échauffement, grincement et usure prématurée.',
        ['chauffe', 'grince', 'bruit', 'graiss', 'huile', 'lubrif'],
        [C('visuel', 'Contrôler niveaux et circuits de lubrification.', 'Niveaux et graissage conformes au plan de maintenance.')]),
      H('Pression pneumatique insuffisante', 'Des vérins lents ou sans force indiquent un manque de pression ou une fuite d’air.',
        ['pneumatique', 'verin', 'air', 'pression', 'lent', 'force', 'fuite'],
        [C('fluide', 'Relever la pression réseau et au point d’utilisation ; rechercher les fuites.', 'Pression ≥ valeur requise (ex. 6 bar), aucune fuite.')]),
      H('Défaut hydraulique', 'Mouvements lents, échauffement ou fuite d’huile orientent vers le circuit hydraulique.',
        ['hydraulique', 'huile', 'pression', 'fuite', 'lent', 'verin', 'chauffe'],
        [C('fluide', 'Relever pression, niveau et température d’huile ; contrôler l’état des filtres.', 'Valeurs conformes au schéma hydraulique.')]),
      H('Dispositif de sécurité machine actif', 'Une sécurité ouverte (carter, barrage, porte) empêche le démarrage.',
        ['securite', 'capteur', 'carter', 'porte', 'barriere', 'ne demarre', 'bloque'],
        [C('fonctionnel', 'Vérifier l’état des dispositifs de sécurité (barrages, interrupteurs de porte, relais de sécurité).', 'Sécurités fermées, relais de sécurité OK (LED).')])
    ],
    generic: [
      H('Absence d’alimentation de l’équipement', 'Avant toute recherche approfondie, vérifier que l’équipement est bien alimenté.',
        ['ne demarre', 'ne fonctionne', 'eteint', 'rien', 'hors service', 'pas de courant', 'aucun'],
        [C('sous_tension', 'Mesurer la tension d’alimentation au plus près de l’équipement.', 'Tension nominale présente.')]),
      H('Conséquence d’une intervention récente', 'Une panne apparue juste après une intervention est souvent liée à celle-ci.',
        ['depuis l intervention', 'depuis le remplacement', 'depuis les travaux', 'apres intervention', 'apres l intervention', 'apres remplacement', 'apres les travaux', 'intervention', 'remplace', 'modif', 'travaux'],
        [C('visuel', 'Recenser les interventions récentes (carnet, collègues) et vérifier ce qui a été modifié.', 'Aucune modification non documentée.')]),
      H('Conditions environnementales', 'Humidité, chaleur, poussière ou orage peuvent déclencher des défauts.',
        ['humid', 'eau', 'chaleur', 'orage', 'poussiere', 'gel', 'pluie', 'foudre'],
        [C('visuel', 'Inspecter l’environnement de l’équipement (infiltrations, ventilation, propreté, traces de surtension).', 'Environnement conforme aux conditions d’utilisation.')])
    ]
  };
  Object.keys(KB).forEach(function (type) {
    KB[type].forEach(function (t, i) { t.id = type + ':' + i; });
  });
  DM.KB = KB;

  DM.findTemplate = function (id) {
    const type = String(id).split(':')[0];
    return (KB[type] || []).find(function (t) { return t.id === id; }) || null;
  };

  /**
   * Propose des hypothèses d'après le type d'installation et les symptômes décrits.
   * Les hypothèses déjà présentes dans le diagnostic sont exclues.
   * @returns {{template: object, score: number, matched: string[]}[]} trié par pertinence
   */
  DM.suggestHypotheses = function (diag) {
    // les réponses mémorisées comptent comme indices (pas les questions : « le différentiel déclenche-t-il ? » ≠ oui)
    const answers = (diag.facts || []).map(function (f) { return f.answer; }).join(' ');
    const text = DM.normText([diag.name, diag.description, diag.symptoms, answers].join(' '));
    const existing = (diag.hypotheses || []).map(function (h) { return DM.normalize(h.cause); });
    const pool = (KB[diag.installationType] || []).concat(KB.generic);
    return pool
      .filter(function (t) { return existing.indexOf(DM.normalize(t.cause)) === -1; })
      .map(function (t, i) {
        const matched = t.keywords.filter(function (k) { return DM.hasKeyword(text, k); });
        return { template: t, score: matched.length, matched: matched, order: i };
      })
      .sort(function (a, b) { return b.score - a.score || a.order - b.order; });
  };
})(window.DM);
