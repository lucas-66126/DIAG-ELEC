/* DIAG-MAINT — types de contrôle et règles de sécurité (sans DOM) */
(function (DM) {
  'use strict';

  DM.CONTROL_TYPES = {
    hors_tension: { label: 'Contrôle hors tension', short: 'HORS TENSION', icon: 'lock', cls: 'off',
      hint: 'Installation consignée : séparée, condamnée, absence de tension vérifiée (VAT).' },
    sous_tension: { label: 'Mesure sous tension', short: 'SOUS TENSION', icon: 'bolt', cls: 'live',
      hint: 'Mesure sur installation alimentée : habilitation et EPI obligatoires.' },
    fluide: { label: 'Mesure fluide / pression / T°', short: 'FLUIDE / PRESSION', icon: 'gauge', cls: 'fluid',
      hint: 'Pressions, températures, circuits frigorifiques, hydrauliques ou pneumatiques.' },
    fonctionnel: { label: 'Essai fonctionnel', short: 'ESSAI', icon: 'play', cls: 'func',
      hint: 'Essai de fonctionnement, test d’un organe, lecture des défauts.' },
    visuel: { label: 'Contrôle visuel / mécanique', short: 'VISUEL', icon: 'eye', cls: 'visual',
      hint: 'Inspection, serrage, état des composants.' }
  };

  const RANK = { info: 1, warning: 2, danger: 3 };
  function maxLevel(a, b) { return (RANK[a] || 0) >= (RANK[b] || 0) ? a : b; }

  const CONSIGNATION = [
    'Séparer l’installation de toutes ses sources d’énergie (y compris secours, onduleur, batteries, photovoltaïque).',
    'Condamner l’organe de séparation en position ouverte (cadenas personnel + étiquette).',
    'Identifier l’ouvrage sur le lieu de travail.',
    'Vérifier l’absence de tension (VAT) sur tous les conducteurs actifs, avec un VAT testé avant et après.',
    'Mettre à la terre et en court-circuit si nécessaire (risque de réalimentation ou d’induction).'
  ];
  const LIVE = [
    'Habilitation électrique adaptée à la tâche (ex. BR, B2V Essai, BE Mesure selon NF C 18-510).',
    'EPI : gants isolants vérifiés, écran facial anti-UV, vêtements non propagateurs de flamme.',
    'Appareil de mesure et cordons de catégorie adaptée (CAT III / CAT IV), en bon état, calibre vérifié.',
    'Baliser la zone, éloigner les personnes non autorisées, éviter le travail isolé.',
    'Si la mesure n’est pas indispensable sous tension, privilégier un contrôle hors tension après consignation.'
  ];
  const FLUID = [
    'Porter gants et lunettes de protection (projection de fluide, brûlure par le froid ou le chaud).',
    'Vérifier que flexibles, manomètres et raccords sont adaptés aux pressions en jeu.',
    'Fluides frigorigènes : attestation d’aptitude requise, aucun rejet à l’atmosphère.',
    'Circuits hydrauliques / pneumatiques : isoler et purger l’énergie résiduelle avant démontage.'
  ];
  const EXTRA = [
    { k: ['condensateur', 'condo'], level: 'warning', t: 'Décharger les condensateurs et vérifier l’absence de tension résiduelle avant manipulation.' },
    { k: ['variateur', 'onduleur', 'bus dc'], level: 'warning', t: 'Variateur / onduleur : attendre la décharge du bus DC (voir notice, souvent 5 à 15 min) et vérifier < 50 V DC.' },
    { k: ['frigorig', 'manifold', 'haute pression', 'hp', 'bp', 'compresseur'], level: 'warning', t: 'Circuit frigorifique sous pression : gants et lunettes, attention aux surfaces chaudes (refoulement) et froides.' },
    { k: ['rotation', 'courroie', 'accouplement', 'arbre', 'ventilateur', 'tourner', 'roue'], level: 'warning', t: 'Pièces en mouvement : consignation mécanique, attendre l’arrêt complet, pas de vêtements amples.' },
    { k: ['pneumat', 'verin', 'air comprime'], level: 'warning', t: 'Énergie pneumatique : isoler et purger le circuit, attention aux mouvements résiduels des vérins.' },
    { k: ['hydraul', 'accumulateur'], level: 'warning', t: 'Énergie hydraulique : isoler, décharger les accumulateurs, risque d’injection d’huile sous pression.' },
    { k: ['batterie'], level: 'warning', t: 'Batteries : risque de court-circuit et d’arc, outils isolés, retirer les bijoux, attention à l’électrolyte.' },
    { k: ['400', 'tgbt', 'jeu de barres', 'hta'], level: 'danger', t: 'Énergie élevée (TGBT, 400 V, jeu de barres) : risque d’arc électrique, EPI arc flash adaptés.' },
    { k: ['hauteur', 'toiture', 'echelle', 'nacelle'], level: 'warning', t: 'Travail en hauteur : protection collective ou harnais, moyen d’accès adapté.' },
    { k: ['extinction', 'co2', 'gaz inerte', 'sprinkler'], level: 'danger', t: 'Extinction automatique : condamner le déclenchement (inhibition / position manuelle) avant tout essai.' },
    { k: ['ouvrir successivement', 'ouvrir les departs', 'ouverture successive'], level: 'warning',
      t: 'Ouvrir un départ arrête tout ce qu’il alimente : prévenir l’exploitant (station de pompage : risque de débordement, process : arrêt de production), un seul départ à la fois, refermer aussitôt, manœuvres réservées au personnel habilité.' },
    { k: ['generateur de recherche', 'injection'], level: 'warning',
      t: 'Générateur de recherche : l’utiliser selon la notice sur réseau IT, pinces autour des conducteurs actifs uniquement, sans ouvrir de coffret sous tension sans habilitation.' }
  ];

  /** Domaines comportant des interventions électriques : rappel de consignation permanent. */
  const ELECTRIC_DOMAINS = ['electricite', 'electrotechnique', 'hvac', 'automatisme', 'moteur', 'pompe', 'acces', 'incendie', 'industriel'];

  DM.domainSafetyReminder = function (installationType) {
    if (ELECTRIC_DOMAINS.indexOf(installationType) === -1) return null;
    return 'Intervention électrique : consigner l’installation avant tout contrôle qui ne nécessite pas la présence de tension ' +
      '(séparation, condamnation, identification, VAT). Mesures sous tension réservées au personnel habilité et équipé.';
  };

  /**
   * Analyse un contrôle et renvoie les consignes de sécurité associées.
   * @returns {{level: null|'warning'|'danger', title: string, points: string[], confirmations: string[], requireAck: boolean}}
   */
  DM.getSafety = function (control, installationType) {
    const c = control || {};
    const text = DM.normText((c.description || '') + ' ' + (c.expected || ''));
    let level = null, title = '';
    const points = [], confirmations = [];
    const add = function (arr, s) { if (arr.indexOf(s) === -1) arr.push(s); };

    if (c.type === 'sous_tension') {
      level = 'danger'; title = 'Mesure sous tension — risque électrique';
      LIVE.forEach(function (p) { add(points, p); });
      add(confirmations, 'Je suis habilité pour cette mesure et je porte les EPI adaptés.');
    } else if (c.type === 'hors_tension') {
      level = 'warning'; title = 'Contrôle hors tension — consignation obligatoire';
      CONSIGNATION.forEach(function (p) { add(points, p); });
      add(confirmations, 'La consignation est effectuée et l’absence de tension a été vérifiée (VAT).');
    } else if (c.type === 'fluide') {
      level = 'warning'; title = 'Circuit sous pression / température';
      FLUID.forEach(function (p) { add(points, p); });
      add(confirmations, 'J’ai pris les protections adaptées (EPI, isolement des énergies).');
    }

    if (installationType === 'incendie' && ['fonctionnel', 'sous_tension', 'hors_tension'].indexOf(c.type) !== -1) {
      level = maxLevel(level, 'warning'); title = title || 'Essai sur système de sécurité incendie';
      add(points, 'Prévenir l’exploitant (et le télésurveilleur) avant tout essai ou mise hors service.');
      add(points, 'Neutraliser les asservissements et transmissions concernés (compartimentage, désenfumage, évacuation) pour éviter un déclenchement intempestif.');
      add(points, 'Remettre en service et vérifier le système en fin d’intervention.');
      add(confirmations, 'L’exploitant est prévenu et les asservissements concernés sont neutralisés.');
    }
    if (installationType === 'industriel' && c.type === 'fonctionnel') {
      level = maxLevel(level, 'warning'); title = title || 'Essai sur machine — zone dangereuse';
      add(points, 'S’assurer que personne ne se trouve dans la zone dangereuse de la machine.');
      add(points, 'Ne jamais shunter un dispositif de sécurité pour réaliser un essai.');
      add(confirmations, 'La zone dangereuse est dégagée et les sécurités machine sont actives.');
    }

    EXTRA.forEach(function (x) {
      if (x.k.some(function (k) { return DM.hasKeyword(text, k); })) {
        add(points, x.t);
        level = maxLevel(level, x.level);
        title = title || 'Points de vigilance sécurité';
      }
    });

    if (level && !confirmations.length) {
      confirmations.push('J’ai pris connaissance de ces consignes et appliqué les mesures de sécurité nécessaires.');
    }
    return { level: level, title: title, points: points, confirmations: confirmations, requireAck: !!level };
  };

  /* ---------- Niveaux de risque (V2) ---------- */
  DM.RISK_LEVELS = {
    1: { label: 'Niveau 1 — Information / observation', short: 'N1', cls: 'r1' },
    2: { label: 'Niveau 2 — Contrôle hors tension', short: 'N2', cls: 'r2' },
    3: { label: 'Niveau 3 — Mesure sous tension', short: 'N3', cls: 'r3' },
    4: { label: 'Niveau 4 — Intervention potentiellement dangereuse', short: 'N4', cls: 'r4' }
  };

  /** Règles électriques rappelées avant toute opération de niveau ≥ 2 sur un domaine électrique. */
  DM.ELECTRICAL_RULES = [
    'Privilégier la consignation : un contrôle qui peut se faire hors tension se fait hors tension.',
    'Ne jamais toucher un conducteur sous tension.',
    'Ne jamais remplacer une protection par un calibre supérieur sans justification technique.',
    'Ne jamais shunter ni contourner une sécurité.'
  ];

  /**
   * Niveau de risque d'un contrôle : calculé d'après sa nature, les mots-clés et le domaine.
   * `control.risk` (proposé par l'agent ou le technicien) peut relever le niveau, jamais l'abaisser.
   * @returns {{level: number, label: string, cls: string, safety: object, precautions: string[]}}
   */
  DM.riskLevel = function (control, installationType) {
    const c = control || {};
    const s = DM.getSafety(c, installationType);
    let level = 1;
    if (c.type === 'hors_tension') level = 2;
    if (c.type === 'sous_tension' || c.type === 'fluide') level = 3;
    if (c.type === 'fonctionnel' && (installationType === 'incendie' || installationType === 'industriel')) level = 3;
    if (s.level === 'warning' && level < 2) level = 2;
    if (s.level === 'danger' && c.type !== 'sous_tension') level = 4;
    if (s.level === 'danger' && c.type === 'sous_tension') {
      const text = DM.normText((c.description || '') + ' ' + (c.expected || ''));
      if (['400', 'tgbt', 'jeu de barres', 'hta', 'extinction', 'co2'].some(function (k) { return DM.hasKeyword(text, k); })) level = 4;
    }
    const asked = parseInt(c.risk, 10);
    if (asked >= 1 && asked <= 4 && asked > level) level = asked;
    const precautions = s.points.slice();
    if (level >= 2 && ELECTRIC_DOMAINS.indexOf(installationType) !== -1) {
      DM.ELECTRICAL_RULES.forEach(function (r) { if (precautions.indexOf(r) === -1) precautions.push(r); });
    }
    const R = DM.RISK_LEVELS[level];
    let label = R.label;
    if (level === 3 && c.type !== 'sous_tension') label = 'Niveau 3 — Mesure / essai sur installation en fonctionnement';
    if (level === 2 && c.type !== 'hors_tension') label = 'Niveau 2 — Contrôle avec précautions';
    return { level: level, label: label, short: R.short, cls: R.cls, safety: s, precautions: precautions };
  };
})(window.DM);
