/* DIAG-MAINT — base de pannes : types d'installation, symptômes courants, outils communs.
 * Les pannes elles-mêmes sont décrites par domaine dans js/pannes/*.js (un fichier par domaine).
 *
 * Mots-clés : écrits en minuscules sans accents, comparés au début des mots de la description,
 * des symptômes et des réponses du technicien (« disjonct » reconnaît « disjoncte », « disjoncteur »).
 * Un mot-clé précédé de « + » est un indice fort (il compte triple). */
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
   * Contrôle type. Un résultat NON CONFORME appuie l'hypothèse ; le DERNIER contrôle d'une hypothèse est celui qui la confirme.
   * opts.localize : contrôle de localisation — un résultat conforme ne contredit pas l'hypothèse,
   * il resserre la zone de recherche (opts.onConform décrit ce qu'on en déduit).
   */
  function C(type, description, expected, why, opts) {
    return Object.assign({ type: type, description: description, expected: expected, why: why || '' }, opts || {});
  }
  /**
   * Hypothèse type : UNE cause précise.
   * advice : réparation conseillée une fois la cause confirmée.
   * opts.diff : true si la cause fait déclencher un différentiel, false si elle ne le fait pas (sert à départager).
   */
  function H(cause, reason, keywords, controls, advice, opts) {
    return Object.assign({ cause: cause, reason: reason, keywords: keywords, controls: controls, advice: advice || '' }, opts || {});
  }

  /* ---------- gabarits partagés entre domaines ---------- */

  /* Régime IT : méthode de recherche d'un défaut d'isolement signalé par le CPI. */
  const FEEDER_TEST = C('fonctionnel',
    'Pendant que le défaut est présent (pré-alarme ou alarme), ouvrir successivement les départs du tableau principal un par un, en notant la valeur du CPI à chaque ouverture, puis refermer.',
    'Aucun départ ne fait remonter nettement le CPI (sinon : le départ qui le fait remonter porte le défaut).',
    'Identifier le départ en défaut sans rien démonter ; en IT, le premier défaut ne fait pas déclencher, on peut chercher en exploitation.',
    { localize: true, feederTest: true, onConform: 'Aucun départ ne se détache : défaut en amont (TGBT) ou multiple.' });
  function isolationFault() {
    return H('Défaut d’isolement sur un départ (humidité, condensation, infiltration)',
      'Un défaut d’isolement qui apparaît la nuit et le matin, s’aggrave après la pluie et disparaît quand il fait sec et chaud est typique d’une humidité ou d’une condensation dans une boîte de jonction, un câble ou un presse-étoupe. En IT, ce premier défaut doit être éliminé avant qu’un second défaut sur une autre phase ne provoque un court-circuit.',
      ['+cpi', '+controleur permanent', '+regime it', 'isolement', 'pre alarme', 'alarme', 'humid', 'pluie', 'matin', 'nuit', 'condensation', 'rosee', 'sec', 'intermitten', 'exterieur', 'fosse'],
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
      'puis refaire la mesure du courant par phase en charge et une thermographie après 40 minutes de marche. Ne pas augmenter le réglage du relais thermique pour « tenir ».',
      { diff: false });
  }
  function thermalSetting() {
    return H('Réglage du relais thermique inadapté',
      'Un réglage trop bas (ou qui ne tient pas compte du montage : In/√3 s’il est placé dans le triangle d’un étoile-triangle) provoque des déclenchements sans défaut réel.',
      ['thermique', 'etoile', 'triangle', '+reglage', 'regle', 'relais', 'remplace', 'neuf'],
      [C('visuel', 'Comparer le réglage du relais thermique au courant qu’il surveille (plaque moteur ; In/√3 ≈ 0,58 × In s’il est placé dans le triangle).', 'Réglage cohérent avec le courant surveillé, sans marge excessive ni insuffisante.',
        'Écarter une cause simple, sans risque, avant de mesurer.')],
      'Régler le relais thermique sur le courant nominal réellement surveillé (plaque moteur, montage), sans marge « de confort », puis contrôler le courant par phase en charge. ' +
      'Un réglage ne se relève jamais pour faire tenir un moteur qui consomme trop.',
      { diff: false });
  }
  /* Automatisme : l'étape active et la transition attendue désignent l'information manquante. */
  const CYCLE_STEP = C('fonctionnel',
    'Relever sur l’IHM ou la console de programmation l’étape active du cycle et la condition attendue pour passer à la suivante.',
    'Aucune condition en attente (sinon : l’information attendue désigne le capteur ou l’actionneur à contrôler).',
    'Savoir précisément ce que l’automate attend avant de démonter quoi que ce soit.',
    { localize: true, onConform: 'Aucune condition bloquante relevée : contrôler directement les capteurs et actionneurs du mouvement arrêté.' });
  /* Variateur : le code et l'historique orientent toute la suite. */
  const DRIVE_CODE = C('visuel',
    'Relever le code défaut affiché par le variateur et son historique (derniers défauts, heures), puis consulter la notice.',
    'Aucun défaut actif ni mémorisé.',
    'Le code oriente directement vers la famille de causes (thermique, surintensité, tension du bus, terre).',
    { localize: true, onConform: 'Aucun défaut mémorisé : le variateur n’est pas à l’origine de l’arrêt, voir la commande.' });

  /* Issue de secours verrouillée : commune au contrôle d'accès et à la sécurité incendie. */
  function emergencyExitLock() {
    return H('Verrouillage d’issue de secours non libéré par l’alarme (asservissement)', 'Une issue de secours verrouillée par ventouse doit se libérer à l’alarme incendie et au déclencheur vert. Si elle reste verrouillée, l’asservissement n’agit pas sur son alimentation : relais non raccordé, contact shunté, câblage modifié.',
      ['+issue de secours', '+ne lache pas', 'reste verrouille', 'a l alarme', 'essai', 'ventouse', 'declencheur vert', 'boitier vert', 'evacuation', 'ne se libere pas'],
      [C('fonctionnel', 'Exploitant prévenu : déclencher l’alarme (ou actionner le déclencheur vert) et mesurer la tension aux bornes du verrouillage de l’issue.', 'Tension nulle pendant l’alarme : l’issue est libérée.',
         'Vérifier la fonction de sécurité elle-même.'),
       C('hors_tension', 'Suivre l’alimentation du verrouillage : contact du relais d’asservissement du SSI et déclencheur vert doivent être en série, sans shunt.', 'Contact d’asservissement et déclencheur vert câblés en série sur l’alimentation du verrouillage.',
         'Trouver pourquoi l’alarme ne coupe pas l’alimentation.')],
      'Faire rétablir par l’installateur le câblage de l’asservissement (coupure de l’alimentation du verrouillage par le SSI et par le déclencheur vert, sécurité positive), puis faire un essai complet et l’inscrire au registre de sécurité. ' +
      'En attendant, l’issue doit rester déverrouillée : une issue de secours ne reste jamais condamnée.');
  }

  DM.kbTools = { C: C, H: H, emergencyExitLock: emergencyExitLock, FEEDER_TEST: FEEDER_TEST, isolationFault: isolationFault, PHASE_CURRENTS: PHASE_CURRENTS,
    contactDegrade: contactDegrade, thermalSetting: thermalSetting, CYCLE_STEP: CYCLE_STEP, DRIVE_CODE: DRIVE_CODE };

  /* ---------- registre ---------- */
  const KB = {};
  DM.KB = KB;
  /** Ajoute des hypothèses types à un domaine (appelé par js/pannes/*.js). */
  DM.kbRegister = function (type, list) {
    KB[type] = (KB[type] || []).concat(list);
    KB[type].forEach(function (t, i) {
      t.id = type + ':' + i;
      if (!t.requis) {
        const n = DM.normalize(t.cause);
        const key = Object.keys(REQUIS).find(function (k) { return n.indexOf(k) === 0; });
        if (key) t.requis = REQUIS[key];
      }
    });
  };
  /* Pannes propres à un matériel : elles ne sont proposées que si ce matériel est cité
   * (inutile de parler de vase d'expansion pour un split, ou d'issue de secours pour un volet de désenfumage). */
  const REQUIS = {
    'defaut d’isolement sur un depart': ['cpi', 'controleur permanent', 'regime it', 'neutre isole'],
    'courants de fuite capacitifs': ['cpi', 'controleur permanent', 'regime it', 'neutre isole'],
    'defaut d’isolement de resistances chauffantes': ['cpi', 'controleur permanent', 'regime it', 'neutre isole'],
    'verrouillage d’issue de secours': ['issue'],
    'photocellules de securite': ['portail', 'barriere', 'portillon motorise'],
    'portail qui force': ['portail', 'barriere'],
    'fin de course ou butee de portail': ['portail', 'barriere'],
    'ordre d’ouverture intempestif': ['portail', 'barriere', 'porte'],
    'degivrage de l’evaporateur': ['chambre froide', 'negative', 'vitrine', 'congel', 'frigo', 'evaporateur'],
    'bloc autonome': ['bloc', 'baes', 'eclairage de securite'],
    'reservoir a vessie': ['surpresseur', 'ballon', 'vessie', 'reservoir'],
    'circulateur bloque': ['circulateur', 'radiateur', 'chauffage'],
    'bruleur en securite': ['bruleur', 'chaudiere', 'flamme', 'aerotherme gaz'],
    'vase d’expansion': ['vase', 'chaudiere', 'chauffage', 'soupape', 'eau glacee'],
    'fuite sur le circuit de chauffage': ['chaudiere', 'chauffage', 'radiateur', 'eau glacee', 'manque d eau'],
    'variateur :': ['variateur'],
    'condensateur de moteur monophase': ['monophase', 'condensateur', '230'],
    'frein electromagnetique': ['frein'],
    'sequence de demarrage etoile-triangle': ['etoile', 'triangle'],
    'reseau de ventilation encrasse': ['vmc', 'bouche', 'extraction', 'ventilation'],
    'courroie de ventilateur': ['courroie', 'cta', 'centrale', 'caisson', 'extracteur', 'ventilateur', 'soufflage'],
    'defaut de degivrage': ['pac', 'pompe a chaleur', 'unite exterieure', 'degivrage', 'reversible'],
    'vanne 4 voies': ['pac', 'pompe a chaleur', 'reversible', 'vanne 4', 'vanne quatre', 'mode chaud', 'clim'],
    'porte coupe-feu': ['coupe feu', 'porte', 'compartimentage'],
    'declencheur manuel': ['declencheur', 'dm ', 'bris de glace', 'alarme', 'rearm'],
    'ligne de diffuseurs': ['diffuseur', 'sirene', 'sonne', 'evacuation'],
    'compresseur d’air': ['compresseur'],
    'bande de convoyeur': ['bande', 'tapis', 'convoyeur'],
    'chaine de transmission': ['chaine', 'pignon'],
    'pompe de relevage des condensats': ['pompe de relevage', 'cassette', 'gainable', 'relevage'],
    'element chauffant coupe': ['four', 'resistance', 'etuve', 'chauffe eau', 'aerotherme', 'batterie electrique', 'cumulus', 'ballon', 'seche', 'convecteur', 'radiateur electrique', 'rideau d air'],
    'minuterie ou telerupteur': ['minuterie', 'telerupteur', 'bouton', 'poussoir', 'lumiere', 'eclairage', 'communs'],
    'bouton poussoir ou interrupteur de commande': ['lumiere', 'eclairage', 'lampe', 'interrupteur'],
    'lampe, luminaire': ['luminaire', 'lampe', 'tube', 'neon', 'spot', 'eclairage', 'ampoule', 'led'],
    'eclairage non commande': ['eclairage', 'lumiere', 'candelabre', 'lampadaire', 'projecteur']
  };

  DM.kbRegister('generic', [
    H('Absence d’alimentation de l’équipement', 'Avant toute recherche approfondie, vérifier que l’équipement est bien alimenté.',
      ['ne demarre', 'ne fonctionne', 'eteint', 'rien', 'hors service', 'pas de courant', 'aucun'],
      [C('sous_tension', 'Mesurer la tension d’alimentation au plus près de l’équipement.', 'Tension nominale présente.')],
      'Remonter vers l’amont jusqu’au point où la tension est présente (protection ouverte, fusible, connexion), traiter la cause de l’ouverture avant de réalimenter.'),
    H('Conséquence d’une intervention récente', 'Une panne apparue juste après une intervention est souvent liée à celle-ci.',
      ['depuis l intervention', 'depuis le remplacement', 'depuis les travaux', 'apres intervention', 'apres l intervention', 'apres remplacement', 'apres les travaux', 'depuis le changement', 'intervention', 'remplace', 'modif', 'travaux'],
      [C('visuel', 'Recenser les interventions récentes (carnet, collègues) et vérifier ce qui a été modifié.', 'Aucune modification non documentée.')],
      'Remettre en conformité ce qui a été modifié (raccordement, réglage, paramètre) et consigner la correction dans le carnet de maintenance.'),
    H('Conditions environnementales', 'Humidité, chaleur, poussière ou orage peuvent déclencher des défauts.',
      ['humid', 'eau', 'chaleur', 'orage', 'poussiere', 'gel', 'pluie', 'foudre'],
      [C('visuel', 'Inspecter l’environnement de l’équipement (infiltrations, ventilation, propreté, traces de surtension).', 'Environnement conforme aux conditions d’utilisation.')],
      'Supprimer la cause d’environnement (étanchéité, ventilation, protection contre les surtensions) et remettre en état les éléments atteints.')
  ]);

  DM.findTemplate = function (id) {
    const type = String(id).split(':')[0];
    return (KB[type] || []).find(function (t) { return t.id === id; }) || null;
  };
  /** Hypothèse type d'après sa cause (tous domaines). */
  DM.findTemplateByCause = function (cause) {
    const n = DM.normalize(cause);
    let found = null;
    Object.keys(KB).some(function (k) {
      found = KB[k].find(function (t) { return DM.normalize(t.cause) === n; }) || null;
      return !!found;
    });
    return found;
  };

  /* Domaines voisins : leurs pannes sont proposées quand plusieurs indices y conduisent
   * (une pompe qui disjoncte peut avoir une panne de moteur ou d'armoire). */
  const RELATED = {
    electricite: [],
    electrotechnique: ['moteur', 'electricite'],
    moteur: ['electrotechnique', 'electricite'],
    pompe: ['moteur', 'electrotechnique', 'electricite'],
    hvac: ['electrotechnique', 'pompe', 'electricite', 'moteur'],
    automatisme: ['electrotechnique', 'industriel'],
    industriel: ['moteur', 'electrotechnique', 'automatisme'],
    acces: [],
    incendie: []
  };
  const RELATED_MIN_SCORE = 3;
  const OTHER_MIN_SCORE = 4;

  /** Le technicien a-t-il dit si le différentiel déclenche ? → true / false / null */
  function differentialTrips(diag, text) {
    const f = (diag.facts || []).find(function (x) { return /differentiel/.test(DM.normalize(x.question)); });
    if (f) {
      if (/^\s*non\b/i.test(f.answer)) return false;
      if (/^\s*oui\b/i.test(f.answer)) return true;
    }
    if (/differentiel (\w+ ){0,2}(ne|n) (declenche|saute|tombe|disjoncte) pas/.test(text) || /pas le differentiel|sans le differentiel|differentiel ne bouge pas/.test(text)) return false;
    return null;
  }

  /* Délai avant déclenchement : un déclenchement immédiat et un déclenchement après plusieurs minutes n'ont pas les mêmes causes. */
  const DELAI = {
    'court-circuit': 'immediat', 'sequence de demarrage etoile-triangle': 'immediat', 'protection inadaptee au courant d’appel': 'immediat', 'compresseur d’air qui demarre en charge': 'immediat',
    'surcharge du circuit': 'differe', 'surcharge mecanique': 'differe', 'reglage du relais thermique': 'differe', 'echauffement de l’armoire': 'differe',
    'surintensite : consommation excessive': 'differe', 'ventilation du moteur insuffisante': 'differe', 'condenseur encrasse': 'differe', 'variateur : surchauffe': 'differe'
  };
  function delaiOf(t) {
    if (t.delai !== undefined) return t.delai;
    const n = DM.normalize(t.cause);
    const key = Object.keys(DELAI).find(function (k) { return n.indexOf(k) === 0; });
    t.delai = key ? DELAI[key] : null;
    return t.delai;
  }
  /** Le déclenchement est-il immédiat ou différé, d'après ce qu'a dit le technicien ? → 'immediat' / 'differe' / null */
  function tripDelay(diag, text) {
    const f = (diag.facts || []).find(function (x) { return /combien de temps/.test(DM.normalize(x.question)); });
    const src = f ? DM.normText(f.answer) : text;
    const now = /immediat|tout de suite|instantan|des qu on rearme|des le rearmement|a l enclenchement|des la mise sous tension| \d+ ?s(ec(onde)?s?)? /.test(src);
    const later = / \d+ ?(min|mn|minutes?|h|heures?) |quelques minutes|apres un moment|une heure|deux heures|plus tard/.test(src);
    if (now === later) return null;
    return now ? 'immediat' : 'differe';
  }

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
    const type = diag.installationType;
    const domains = Object.keys(KB).filter(function (k) { return k !== 'generic'; });
    const unknown = type === 'autre' || !KB[type];
    // domaines cités dans la description (« moteur de la pompe ») : leurs pannes comptent comme celles du domaine principal
    const cited = DM.typeScores ? Object.keys(DM.typeScores(text)) : [];
    const pool = [];
    const seen = {};
    function push(list, min, rank) {
      (list || []).forEach(function (t) {
        const key = DM.normalize(t.cause);
        if (seen[key]) return;
        seen[key] = true;
        pool.push({ t: t, min: min, rank: rank });
      });
    }
    push(KB[type], 0, 0);
    push(KB.generic, 0, 0);
    domains.forEach(function (k) { if (unknown || cited.indexOf(k) !== -1) push(KB[k], unknown ? 0 : 1, 1); });
    (RELATED[type] || []).forEach(function (k) { push(KB[k], RELATED_MIN_SCORE, 2); });
    // tout autre domaine : seulement sur un faisceau d'indices net
    // (sécurité incendie et contrôle d’accès restent à part : leurs pannes ne concernent que leurs matériels)
    domains.forEach(function (k) { if (k !== 'incendie' && k !== 'acces') push(KB[k], OTHER_MIN_SCORE, 3); });
    const diff = differentialTrips(diag, text);
    const delay = tripDelay(diag, text);
    return pool
      .filter(function (p) { return existing.indexOf(DM.normalize(p.t.cause)) === -1; })
      .filter(function (p) { return !p.t.requis || p.t.requis.some(function (k) { return DM.hasKeyword(text, k); }); })
      .map(function (p, i) {
        let score = 0;
        const matched = [];
        p.t.keywords.forEach(function (k) {
          const strong = k.charAt(0) === '+';
          const word = strong ? k.slice(1) : k;
          if (DM.hasKeyword(text, word)) { score += strong ? 3 : 1; matched.push(word); }
        });
        // le comportement du différentiel départage les causes « fuite à la terre » des causes « surintensité »
        if (diff !== null && typeof p.t.diff === 'boolean' && p.t.diff !== diff) score = 0;
        // de même pour le délai : un court-circuit ne met pas dix minutes à faire déclencher
        if (delay && delaiOf(p.t) && delaiOf(p.t) !== delay) score = 0;
        return { template: p.t, score: score, matched: score ? matched : [], order: i, min: p.min, rank: p.rank };
      })
      .filter(function (x) { return x.score >= x.min; })
      .sort(function (a, b) { return b.score - a.score || a.rank - b.rank || a.order - b.order; });
  };
})(window.DM);
