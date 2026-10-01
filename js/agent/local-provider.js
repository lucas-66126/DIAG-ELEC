/* DIAG-MAINT — LocalProvider : moteur de diagnostic à règles, sans IA ni réseau.
 *
 * Utilisé hors connexion, sans serveur, ou sans clé d'API. Il pilote les MÊMES outils que l'IA
 * (mêmes garde-fous) en émettant des blocs tool_use au format Messages API :
 *   compréhension du message → évaluation des résultats → questions essentielles (une à la fois)
 *   → hypothèses (base de pannes) → plan de contrôle → réponse.
 * Il ne fait ni analyse d'image, ni lecture de document, ni recherche Web.
 */
(function (DM) {
  'use strict';

  DM.agent = DM.agent || {};
  const LOCAL_TOOLS = ['ask_user', 'record_fact', 'update_equipment', 'set_fault', 'upsert_hypothesis', 'propose_control',
    'save_measurement', 'record_control_result', 'set_diagnosis_status', 'suggest_report', 'search_previous_diagnostics'];

  function s(v) { return v == null ? '' : String(v).trim(); }
  function has(n, words) { return words.some(function (w) { return DM.hasKeyword(n, w); }); }

  const BRANDS = ['Mitsubishi Electric', 'Mitsubishi', 'Daikin', 'Toshiba', 'Panasonic', 'Fujitsu', 'Hitachi', 'Samsung', 'LG', 'Atlantic', 'Carrier',
    'Trane', 'York', 'Lennox', 'Ciat', 'Airwell', 'Schneider', 'Legrand', 'Hager', 'ABB', 'Siemens', 'Grundfos', 'Wilo', 'KSB', 'Danfoss',
    'SEW', 'Leroy-Somer', 'WEG', 'Omron', 'Allen-Bradley', 'Somfy', 'Came', 'BFT', 'Urmet', 'Aiphone', 'Esser', 'Finsecur', 'Nugelec',
    'Bosch', 'Atlas Copco', 'Festo', 'SMC', 'Viessmann', 'De Dietrich', 'Saunier Duval', 'Frisquet'];

  const TYPE_RULES = [
    // surveillance d'isolement : c'est l'installation électrique qui est en cause, pas la pompe ou la machine citée
    ['electricite', ['cpi', 'controleur permanent', 'regime it', 'neutre isole', 'defaut d isolement']],
    ['hvac', ['clim', 'climatis', 'split', 'ventilo', 'vitrine refrigeree', 'aerotherme', 'pac ', 'pompe a chaleur', 'groupe froid', 'cta', 'vmc', 'rooftop', 'unite exterieure', 'unite interieure', 'chaudiere',
      'bruleur', 'chambre froide', 'evaporateur', 'condenseur', 'frigorifique', 'centrale de traitement', 'ventilo convecteur', 'radiateurs', 'circuit de chauffage', 'condensats']],
    ['incendie', ['ssi', 'incendie', 'desenfum', 'detecteur de fumee', 'detecteur optique', 'detecteur automatique', 'detecteurs', 'ecs', 'cmsi', 'alarme incendie', 'alarme feu',
      'declencheur manuel', 'boucle de detection', 'boucles adressables', 'isolateur', 'erp', 'baes', 'bloc de secours', 'eclairage de securite', 'coupe feu', 'clapet',
      'sirene', 'diffuseur sonore', 'aes', 'centrale incendie', 'zone de detection']],
    ['acces', ['badge', 'gache', 'ventouse', 'controle d acces', 'interphone', 'lecteur de badge', 'visiophone', 'portail', 'barriere levante', 'digicode', 'bouton de sortie', 'porte forcee']],
    ['pompe', ['pompe', 'surpresseur', 'relevage', 'circulateur', 'forage', 'refoulement']],
    ['automatisme', ['automate', 'api ', 'plc', 'ihm', 'hmi', 'profinet', 'profibus', 'modbus', 'capteur', 'detecteur inductif', 'cellule photo', 'cellule de', 'comptage', 'cycle', 'grafcet', 'electrovanne',
      '4 20', 'entree', 'pupitre']],
    ['moteur', ['moteur', 'variateur', 'ventilateur d extraction', 'roulement']],
    ['industriel', ['machine', 'convoyeur', 'presse', 'robot', 'verin', 'hydraulique', 'pneumatique', 'compresseur d air', 'reducteur', 'motoreducteur', 'courroie', 'palier',
      'bande', 'chaine', 'air comprime', 'carter', 'malaxeur']],
    ['electrotechnique', ['contacteur', 'armoire', 'relais', 'telerupteur', 'coffret', 'bouton marche', 'etoile triangle', 'circuit de commande', 'arret d urgence', 'bobine']],
    ['electricite', ['disjonct', 'differentiel', 'tableau', 'prise', 'eclairage', 'circuit', 'tgbt', 'fusible', 'neutre', 'installation electrique', 'compteur electrique',
      'lumiere', 'minuterie', 'four', 'candelabre', 'sectionneur']]
  ];
  /** Nombre d'indices de chaque domaine dans un texte normalisé : {moteur: 2, pompe: 1…} (sert aussi à croiser les domaines cités). */
  DM.typeScores = function (n) {
    const out = {};
    TYPE_RULES.forEach(function (r) {
      const score = r[1].filter(function (k) { return DM.hasKeyword(n, k); }).length;
      if (score) out[r[0]] = (out[r[0]] || 0) + score;
    });
    return out;
  };

  const UNIT_RE = /([<>≥≤]\s*)?(?:(\d+(?:[.,]\d+)?)\s*(?:à|-)\s*)?(-?\d+(?:[.,]\d+)?)\s*(µF|uF|nF|GΩ|MΩ|kΩ|mΩ|Ω|Mohms?|kohms?|ohms?|mA|kA|A|mV|kV|V\s?AC|V\s?DC|VAC|VDC|V|kHz|Hz|°C|degr[ée]s?|bar|kPa|MPa|psi|kW|W|%)(?![A-Za-zÀ-ÿ0-9])/g;
  const UNIT_NORM = { uf: 'µF', ohm: 'Ω', ohms: 'Ω', kohm: 'kΩ', kohms: 'kΩ', mohm: 'MΩ', mohms: 'MΩ', vac: 'V AC', vdc: 'V DC', 'v ac': 'V AC', 'v dc': 'V DC',
    degre: '°C', degres: '°C', 'degré': '°C', 'degrés': '°C' };

  /** Mesures citées dans un texte : [{value, unit, label}] (valeurs exactement telles qu'écrites ;
   *  label = repère qui précède la valeur : L1, L2-L3, U, pôle 2…). */
  DM.agent.parseMeasurements = function (text) {
    const out = [];
    const src = String(text || '');
    let m;
    UNIT_RE.lastIndex = 0;
    while ((m = UNIT_RE.exec(src))) {
      let unit = m[4];
      const key = unit.toLowerCase();
      unit = UNIT_NORM[key] || unit.replace(/\s+/, ' ');
      const before = src.slice(Math.max(0, m.index - 20), m.index);
      const lab = before.match(/(L[123](?:\s?(?:-|et|,)\s?L?[123])*|[UVW][12]?(?:\s?-\s?[UVW][12]?)?|phase\s?\d|p[ôo]le\s?\d|conducteur\s?[+\-−])\s*[:=]?\s*$/i);
      // un comparateur (« > 100 MΩ ») est conservé : c'est une valeur minimale, pas une valeur exacte ;
      // une plage (« 0,8 à 40 MΩ ») est conservée telle quelle, sa valeur basse compte pour l'analyse
      const cmp = m[1] ? m[1].trim() : '';
      const value = m[2] ? m[2] + ' à ' + m[3] : (cmp ? cmp + ' ' : '') + m[3];
      out.push({ value: value, unit: unit, label: lab ? lab[1].replace(/\s+/g, ' ').trim() : '' });
    }
    return out;
  };
  function num(v) { return parseFloat(String(v).replace(/[<>≥≤\s]/g, '').replace(',', '.')); }

  /**
   * Analyse d'une série de valeurs de même unité (courants par phase, chutes de tension par pôle, températures…).
   * Calcul uniquement à partir des valeurs données : écart maximal à la moyenne et valeur hors série.
   * @returns {null | {imbalancePct, outlier: {value, label}|null, abnormal: boolean, summary: string}}
   */
  DM.agent.analyzeSeries = function (measures) {
    if (!measures || measures.length < 2) return null;
    const unit = measures[0].unit;
    if (!measures.every(function (x) { return x.unit === unit; })) return null;
    const vals = measures.map(function (x) { return num(x.value); });
    if (vals.some(isNaN)) return null;
    const mean = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    if (mean <= 0) return null;
    let iMax = 0;
    vals.forEach(function (v, i) { if (Math.abs(v - mean) > Math.abs(vals[iMax] - mean)) iMax = i; });
    const pct = Math.round(Math.abs(vals[iMax] - mean) / mean * 1000) / 10;
    const others = vals.filter(function (v, i) { return i !== iMax; });
    const otherMean = others.reduce(function (a, b) { return a + b; }, 0) / others.length;
    // une valeur « hors série » : nettement différente des autres (écart > 10 % à la moyenne, ou > ×3 pour de petites valeurs)
    const abnormal = pct > 10 || (otherMean > 0 && vals[iMax] / otherMean > 3);
    const lab = measures[iMax].label;
    const fmt = function (v) { return String(Math.round(v * 100) / 100).replace('.', ','); };
    const ratio = otherMean > 0 ? vals[iMax] / otherMean : 0;
    const who = (lab ? lab + ' à ' : '') + measures[iMax].value + ' ' + unit;
    let summary;
    if (!abnormal) summary = 'Valeurs homogènes (écart maximal ' + String(pct).replace('.', ',') + ' % à la moyenne).';
    else if (ratio > 3) summary = who + ' se détache nettement : environ ' + Math.round(ratio) + ' fois la valeur des autres (' + fmt(otherMean) + ' ' + unit + ').';
    else summary = 'Écart de ' + String(pct).replace('.', ',') + ' % par rapport à la moyenne (' + fmt(mean) + ' ' + unit + ') : ' + who + ' se détache des autres.';
    return {
      imbalancePct: pct,
      outlier: abnormal ? { value: measures[iMax].value, label: lab } : null,
      abnormal: abnormal,
      summary: summary
    };
  };

  /** Libellé court d'une mesure d'après la description du contrôle (« Mesurer l'intensité absorbée par … (pince) » → « Intensité absorbée par … »). */
  function shortLabel(desc) {
    if (/ouvrir successivement les d[ée]parts/i.test(desc)) return 'Ouverture successive des départs';
    let t = s(desc).replace(/^(unité consignée\s*:\s*)?/i, '')
      .replace(/^pendant que[^,]*,\s*/i, '')
      .replace(/^[^:]{0,45}consign[ée]+s?\s*:\s*/i, '')
      .replace(/^(mesurer|relever|contrôler|vérifier|tester|observer)\s+/i, '')
      .replace(/^(en charge|en fonctionnement|à vide)\s+/i, '')
      .replace(/^(la |le |les |l['’]|un |une |des )/i, '');
    t = t.split(/\s\(|,|;|\. /)[0];
    if (t.length > 60) t = t.slice(0, 60).replace(/\s+\S*$/, '') + '…';
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function noDot(t) { return s(t).replace(/[.\s]+$/, ''); }

  /** Type d'installation : celui qui cumule le plus d'indices (à égalité, l'ordre des règles départage). */
  function detectType(n) {
    let best = null, bestScore = 0;
    TYPE_RULES.forEach(function (r) {
      const score = r[1].filter(function (k) { return DM.hasKeyword(n, k); }).length;
      if (score > bestScore) { best = r[0]; bestScore = score; }
    });
    return best;
  }
  function detectBrand(text) {
    const n = DM.normText(text);
    for (let i = 0; i < BRANDS.length; i++) if (DM.hasKeyword(n, DM.normText(BRANDS[i]).trim())) return BRANDS[i];
    return null;
  }
  function detectReference(text) {
    const m = String(text || '').match(/(?:r[ée]f(?:[ée]rence)?|mod[eè]le|type)\s*(?:exacte\s*)?[:=]?\s*([A-Za-z0-9][A-Za-z0-9\-\/\.]{3,})/i);
    return m && /\d/.test(m[1]) && /[A-Za-z]/.test(m[1]) ? m[1].replace(/[.]$/, '').toUpperCase() : null;
  }
  function protectionMention(text) {
    const m = String(text || '').match(/\b([BCD])\s?(\d{1,3})\b/);
    return m && parseInt(m[2], 10) <= 125 ? m[1] + m[2] : null;
  }
  function normalizeAnswer(text) {
    const n = DM.normText(text);
    if (has(n, ['je ne sais pas', 'sais pas', 'nsp', 'aucune idee', 'je ne la trouve pas', 'introuvable'])) return 'Inconnu (le technicien ne sait pas)';
    if (/^\s*(oui|yes|ouais|affirmatif)\b/i.test(text)) return 'Oui' + (s(text).length > 4 ? ' — ' + s(text) : '');
    if (/^\s*(non|no|nan|negatif|négatif)\b/i.test(text)) return 'Non' + (s(text).length > 4 ? ' — ' + s(text) : '');
    return s(text);
  }
  function yesNo(text) {
    if (/^\s*(oui|yes|ouais|confirm)/i.test(text)) return true;
    if (/^\s*(non|no|nan)\b/i.test(text)) return false;
    return null;
  }
  function verdictFrom(text) {
    const n = DM.normText(text);
    if (has(n, ['non conforme', 'pas conforme', 'hors tolerance', 'pas bon', 'pas normal', 'pas correct', 'pas ok', 'pas terrible', 'pas net'])) return 'non_conforme';
    // « Tronçon 2.31 à 2.39 : défaut » : le technicien signale lui-même un défaut
    if (/:\s*(?:en\s+)?d[ée]faut\b/i.test(text)) return 'non_conforme';
    // tournures négatives courantes : « rien d'anormal », « aucun défaut », « RAS »
    if (has(n, NOTHING_WRONG)) return 'conforme';
    if (has(n, ['anormal', 'mauvais', 'hs ', 'ne fonctionne pas', 'instable', 'defectueu', 'hors service'])) return 'non_conforme';
    if (hasFinding(n)) return 'non_conforme';
    if (has(n, ['conforme', 'normal', 'bon ', 'bons ', 'bonne ', 'bonnes ', 'ok ', 'correct', 'fonctionnent', 'fonctionne correctement', 'fonctionne parfaitement',
      'fonctionne bien', 'sain ', 'saine ', 'sains ', 'propre', 'intact'])) return 'conforme';
    if (has(n, ['je ne sais pas', 'sais pas', 'indetermine'])) return 'indetermine';
    return null;
  }
  const NOTHING_WRONG = ['rien d anormal', 'rien a signaler', 'ras ', 'aucune anomalie', 'aucun defaut', 'pas de defaut', 'pas d anomalie', 'sans anomalie', 'sans defaut'];
  const NEGATIONS = ['pas', 'aucun', 'aucune', 'sans', 'ni', 'non', 'absence', 'rien', 'jamais'];
  /** Vrai si le texte rapporte une anomalie constatée (« bobine coupée »), sauf si elle est niée (« pas de fuite », « ni oxydation »). */
  function hasFinding(nt) {
    return FINDINGS.some(function (k) {
      let i = nt.indexOf(' ' + k);
      while (i !== -1) {
        const before = nt.slice(0, i).trim().split(' ').slice(-3);
        if (!before.some(function (w) { return NEGATIONS.indexOf(w) !== -1; })) return true;
        i = nt.indexOf(' ' + k, i + 1);
      }
      return false;
    });
  }

  /** Valeur en MΩ d'une mesure de résistance / d'isolement (null si l'unité ne s'y prête pas). */
  function toMOhm(m) {
    const v = num(m.value);
    const factor = { 'GΩ': 1000, 'MΩ': 1, 'kΩ': 1e-3, 'Ω': 1e-6, 'mΩ': 1e-9 }[m.unit];
    return isNaN(v) || factor == null ? null : v * factor;
  }

  /** Isolement : conforme si toutes les valeurs ≥ 1 MΩ (seuil courant de la NF C 15-100 pour < 500 V ; ≥ 0,5 MΩ minimum légal). */
  DM.agent.analyzeInsulation = function (measures) {
    const vals = measures.map(function (m) { return { m: m, mo: toMOhm(m) }; }).filter(function (x) { return x.mo != null; });
    if (!vals.length) return null;
    const low = vals.filter(function (x) { return x.mo < 1; });
    const fmt = function (x) { return (x.m.label ? x.m.label + ' à ' : '') + x.m.value + ' ' + x.m.unit; };
    if (low.length) {
      const ok = vals.filter(function (x) { return x.mo >= 1; });
      return { abnormal: true, summary: 'Isolement insuffisant : ' + low.map(fmt).join(', ') + ' (< 1 MΩ)' + (ok.length ? ' ; ' + ok.map(fmt).join(', ') + ' correct' : '') + '.',
        labels: low.map(function (x) { return x.m.label; }).filter(Boolean) };
    }
    return { abnormal: false, summary: 'Isolement correct : ' + vals.map(fmt).join(', ') + ' (≥ 1 MΩ).', labels: [] };
  };

  /**
   * Résultat d'une ouverture successive des départs (régime IT) :
   * « D1 : pas de changement · D2 : CPI remonte à 280 kΩ · D3 : +30 kΩ seulement · D4, D5 : pas de changement ».
   * Le départ dont l'ouverture fait nettement remonter le CPI porte le défaut.
   */
  DM.agent.analyzeFeeders = function (text) {
    const re = /((?:D\d+\s*(?:,|et)\s*)*D\d+)\s*:\s*([^·;\n]+)/gi;
    const feeders = [];
    let m;
    while ((m = re.exec(String(text || '')))) {
      const seg = m[2];
      let kohm = 0, kind = 'none';
      const abs = seg.match(/remonte\s*(?:à|a|jusqu['’]?à)?\s*(\d+(?:[.,]\d+)?)\s*(k|M)?Ω/i);
      const delta = seg.match(/\+\s*(\d+(?:[.,]\d+)?)\s*(k|M)?Ω/i);
      if (abs) { kohm = parseFloat(abs[1].replace(',', '.')) * (abs[2] === 'M' ? 1000 : 1); kind = 'absolu'; }
      else if (delta) { kohm = parseFloat(delta[1].replace(',', '.')) * (delta[2] === 'M' ? 1000 : 1); kind = 'hausse'; }
      m[1].split(/\s*(?:,|et)\s*/).forEach(function (id) { feeders.push({ id: id.toUpperCase(), kohm: kohm, kind: kind, text: seg.trim() }); });
    }
    if (feeders.length < 2) return null;
    const best = feeders.slice().sort(function (a, b) { return b.kohm - a.kohm; })[0];
    const second = feeders.filter(function (f) { return f !== best; }).sort(function (a, b) { return b.kohm - a.kohm; })[0];
    // net : le meilleur départ fait remonter le CPI au moins 3 fois plus que le suivant
    if (!best.kohm || (second && second.kohm * 3 > best.kohm)) return { found: null, feeders: feeders, summary: 'Aucun départ ne se détache nettement.' };
    const others = feeders.filter(function (f) { return f !== best && f.kohm > 0; });
    return {
      found: best.id, feeders: feeders,
      summary: 'L’ouverture de ' + best.id + ' fait remonter le CPI' + (best.kind === 'absolu' ? ' à ' + best.kohm + ' kΩ' : ' de ' + best.kohm + ' kΩ') +
        ' : le défaut est sur ' + best.id + '.' +
        (others.length ? ' ' + others.map(function (f) { return f.id + ' : ' + f.text; }).join(' ; ') + ' (effet faible, l’alarme reste).' : '')
    };
  };

  /** Constats visuels qui signent un défaut (inspection, localisation). */
  const FINDINGS = ['vert de gris', 'oxyd', 'condensation', 'humid', 'ruissel', 'mal serre', 'desserr', 'ecrase', 'brul', 'noirci', 'fissur',
    'casse', 'absent apres', 'disparait', 'infiltration', 'corrod', 'eau dans', 'traces d eau', 'traverse', 'perce', 'blesse', 'abime',
    'endommag', 'denude', 'frotte', 'pince', 'coince', 'arrache', 'sectionn',
    'coupee', 'coupees', 'fil coupe', 'conducteur coupe', 'enroulement coupe', 'circuit ouvert', 'coupure', 'infini', 'fondu', 'grille', 'bloque', 'grippe',
    'use ', 'usee', 'uses ', 'usees', 'usure', 'fuit', 'fuite', 'colmat', 'encrass', 'bouchee', 'bouche par',
    'obstru', 'detendu', 'desalign', 'point dur', 'gonfle', 'ne reagit pas', 'ne change pas', 'soude', 'fendu', 'dechire', 'absente', 'manquant',
    'nulle', 'sale', 'charbonn', 'piqu', 'jeu important', 'jeu anormal', 'trop bas', 'trop haut', 'trop faible', 'trop eleve', 'trop court', 'trop long', 'trop loin',
    'insuffisant', 'ne tourne pas', 'ne demarre pas', 'ne bascule pas', 'ne colle pas', 'ne s allume pas', 'ne bouge pas', 'ne se fait pas', 'laiteu', 'mousse',
    'limaille', 'craquel', 'deboit', 'deregl', 'mal regle', 'mal aligne', 'decale', 'tordu', 'deforme', 'rotor colle', 'tiroir colle', 'reste colle', 'rouille', 'lustre',
    'en court circuit', 'au rouge', 'cuve vide', 'degonfle', 'filasse', 'lingette', 'enroule', 'hernie', 'affaisse', 'il force', 'qui force', 'saute des dents',
    'de l eau sort', 'retire', 'enfonce', 'mal verrouille', 'couchees', 'plein de', 'pleine de', 'ouvert en permanence', 'reste ferme', 'reste ouvert',
    'ne tient pas', 's ecroule', 'chute a', 'tombe a', 'ne recoit pas', 'ne voit pas', 'n arrive pas', 'aucune tension', 'pas de tension', 'plus de tension'];

  /** Durée déjà indiquée dans la description (« 30 à 50 minutes », « après 5 min », « jusqu'à 11h »…). */
  const DURATION_RE = /(\d+\s*(?:(?:à|a|-)\s*\d+\s*)?(?:min(?:ute)?s?|h(?:eures?)?\b|s(?:econdes?)?\b))/i;
  /** La panne est-elle un déclenchement de protection ? (« ça saute de 10 à 90 % » n’en est pas un) */
  function tripping(n) {
    return has(n, ['disjonct', 'fusible', 'se met en securite']) ||
      (has(n, ['declench']) && !has(n, ['alarme', 'sirene', 'detecteur', 'degivrage'])) ||
      (has(n, ['declench', 'saute', 'coupe', 's arrete']) && has(n, ['protection', 'thermique', 'differentiel', 'plomb', 'courant', 'general', 'tableau', 'relais']));
  }
  function thermalTrip(n) { return has(n, ['thermique', 'relais thermique', 'defaut thermique']); }
  /** Surveillance d'isolement (CPI, régime IT) : défaut d'installation, pas d'un matériel précis. */
  function isolationMonitor(n) { return has(n, ['cpi', 'controleur permanent', 'regime it']); }
  /** Défaut de boucle / ligne de détection (SSI) : défaut de câblage, pas d'un appareil précis. */
  function loopFault(n) { return has(n, ['boucle', 'defaut terre', 'isolateur', 'ligne de detection']) && has(n, ['ssi', 'ecs', 'detecteur', 'detection', 'incendie']); }
  /** Défaut d'installation (réseau, boucle) : les questions « référence » et « code défaut » n'aident pas. */
  function installationFault(n) { return isolationMonitor(n) || loopFault(n); }
  const MOTOR_TYPES = ['moteur', 'electrotechnique', 'industriel', 'pompe'];

  /** Questions essentielles, posées une par une, uniquement si la réponse n'est ni connue ni déjà dans la description. */
  const QUESTIONS = [
    { id: 'delai', question: 'Au bout de combien de temps de fonctionnement la protection déclenche-t-elle ?',
      choices: ['Immédiatement', 'Après quelques minutes', 'De façon aléatoire'],
      when: function (n, d, raw) { return tripping(n) && !DURATION_RE.test(raw); } },
    { id: 'differentiel', question: 'Le différentiel en amont déclenche-t-il également ?', choices: ['Oui', 'Non', 'Je ne sais pas'],
      // inutile quand le défaut est clairement thermique (relais thermique identifié)
      when: function (n) { return tripping(n) && !has(n, ['differentiel']) && !thermalTrip(n); } },
    { id: 'code', question: 'Un code défaut est-il affiché (télécommande, carte électronique, écran) ?', choices: ['Oui', 'Non', 'Je ne sais pas'],
      when: function (n, d) {
        return (['hvac', 'automatisme', 'incendie', 'acces'].indexOf(d.installationType) !== -1 || has(n, ['variateur', 'automate', 'ecran', 'carte'])) &&
          !DM.extractErrorCodes(n).length && !installationFault(n);
      } },
    { id: 'plaque_moteur', question: 'Quelles sont les données de la plaque moteur (puissance, intensité nominale, couplage / démarrage) et le réglage du relais thermique ?',
      choices: ['Je ne les ai pas'],
      when: function (n, d) { return MOTOR_TYPES.indexOf(d.installationType) !== -1 && thermalTrip(n); } },
    { id: 'cpi_present', question: 'Le défaut est-il présent en ce moment (pré-alarme ou alarme sur le CPI) ? La recherche du départ en défaut se fait pendant qu’il est présent.',
      choices: ['Oui, défaut présent', 'Non, valeur normale'],
      when: function (n) { return isolationMonitor(n); } },
    { id: 'reference', question: 'Quelle est la référence exacte du matériel ? Tu peux aussi envoyer une photo de sa plaque signalétique.',
      choices: ['Je ne la trouve pas'],
      when: function (n, d) { return !d.reference && !d.model && !(MOTOR_TYPES.indexOf(d.installationType) !== -1 && thermalTrip(n)) && !installationFault(n); } }
  ];

  function LocalProvider() {
    this.name = 'local';
    this.stage = 0;
    this.notes = {};
    this.pending = null;
    this.counter = 0;
  }
  LocalProvider.prototype.supportsTool = function (name) { return LOCAL_TOOLS.indexOf(name) !== -1; };

  LocalProvider.prototype.toolUse = function (calls) {
    const self = this;
    return {
      content: calls.map(function (c) { return { type: 'tool_use', id: 'local_' + (++self.counter), name: c.name, input: c.input }; }),
      stop_reason: 'tool_use', usage: {}, model: 'local'
    };
  };

  LocalProvider.prototype.complete = async function (req) {
    const d = req.context.diag;
    if (this.pending) {
      const t = this.pending; this.pending = null;
      return { content: [{ type: 'text', text: t }], stop_reason: 'end_turn', usage: {}, model: 'local' };
    }
    this.readToolResults(req.messages);
    const stages = [this.understand, this.evaluate, this.essentials, this.hypotheses, this.controls, this.compose];
    while (this.stage < stages.length) {
      const out = stages[this.stage++].call(this, d, req);
      if (out && out.calls && out.calls.length) {
        if (out.text != null) this.pending = out.text;
        return this.toolUse(out.calls);
      }
      if (out && out.text != null) return { content: [{ type: 'text', text: out.text }], stop_reason: 'end_turn', usage: {}, model: 'local' };
    }
    return { content: [{ type: 'text', text: 'D’accord.' }], stop_reason: 'end_turn', usage: {}, model: 'local' };
  };

  /** Récupère les résultats d'outils utiles (recherche dans l'historique). */
  LocalProvider.prototype.readToolResults = function (messages) {
    const last = messages[messages.length - 1];
    if (!last || !Array.isArray(last.content)) return;
    const kbId = this.notes.kbCallId;
    last.content.forEach(function (b) {
      if (b.type === 'tool_result' && b.tool_use_id === kbId && typeof b.content === 'string' && b.content.indexOf('Aucun') !== 0) this.notes.kbText = b.content;
    }, this);
  };

  function context(d) {
    const msgs = d.messages;
    const current = msgs[msgs.length - 1];
    let prevAsk = null, prevUser = null;
    for (let i = msgs.length - 2; i >= 0; i--) {
      if (msgs[i].role === 'assistant') { prevAsk = msgs[i].ask || null; break; }
    }
    for (let i = msgs.length - 2; i >= 0; i--) { if (msgs[i].role === 'user') { prevUser = msgs[i]; break; } }
    return { text: current.text || '', attachments: current.attachments || [], prevAsk: prevAsk, prevUser: prevUser };
  }

  /* 1. Compréhension du message du technicien */
  LocalProvider.prototype.understand = function (d) {
    const c = context(d);
    const text = c.text, n = DM.normText(text);
    const calls = [];
    const notes = this.notes;
    const ask = c.prevAsk;
    const measures = DM.agent.parseMeasurements(text);
    const attachedMeasure = c.attachments.some(function (a) { return a.type === 'measurement'; });
    if (c.attachments.some(function (a) { return a.type === 'photo'; })) notes.photo = true;
    const attachedControl = c.attachments.some(function (a) { return a.type === 'control'; });

    if (ask && ask.kind === 'verdict' && ask.controlId && DM.findControl(d, ask.controlId) && !DM.hasResult(DM.findControl(d, ask.controlId))) {
      const verdict = verdictFrom(text) || 'indetermine';
      const ctl = DM.findControl(d, ask.controlId);
      const ms = DM.measurementsOf(d, ctl.id);
      const obtained = ms.length ? ms.map(function (m) { return m.value + (m.unit ? ' ' + m.unit : ''); }).join(', ') : (c.prevUser ? c.prevUser.text : text);
      calls.push({ name: 'record_control_result', input: { control_id: ctl.id, obtained: obtained, verdict: verdict } });
      notes.result = { controlId: ctl.id, verdict: verdict, obtained: obtained };
    } else if (ask && ask.kind === 'result' && ask.controlId && DM.findControl(d, ask.controlId)) {
      let ctl = DM.findControl(d, ask.controlId);
      const family = function (k) { return k === 'isolement' ? 'resistance' : k; };
      const isFeederTest = /ouvrir successivement les departs/.test(DM.normalize(ctl.description));
      if (measures.length && !isFeederTest) {
        // plusieurs valeurs dans le message : seules celles de la grandeur du contrôle comptent
        // (« au mégohmmètre 500 V » est la tension d'essai, pas le résultat)
        const ctlKinds = DM.controlMeasureKinds(ctl).map(family);
        const relevant = measures.filter(function (m) { return ctlKinds.indexOf(family(DM.kindFromUnit(m.unit))) !== -1; });
        if (ctlKinds.length && relevant.length) measures.splice(0, measures.length, ...relevant);
        // la valeur donnée ne correspond pas à la grandeur attendue : on cherche le contrôle qu'elle concerne
        const k = family(DM.kindFromUnit(measures[0].unit));
        const kinds = DM.controlMeasureKinds(ctl).map(family);
        if (kinds.length && kinds.indexOf(k) === -1) {
          const alt = DM.pendingControls(d).find(function (c) { return DM.controlMeasureKinds(c).map(family).indexOf(k) !== -1; });
          if (alt) { ctl = alt; notes.relinked = alt.id; }
          else {
            // aucune grandeur ne correspond : la valeur est notée à part, jamais rattachée au mauvais contrôle
            notes.unitMismatch = { ctl: ctl, unit: measures[0].unit, kind: DM.MEASURE_KINDS[DM.kindFromUnit(measures[0].unit)].label.toLowerCase(),
              expected: DM.controlMeasureKinds(ctl).map(function (x) { return (DM.MEASURE_KINDS[x] || { label: x }).label.toLowerCase(); }).join(' / ') };
            measures.forEach(function (m) {
              calls.push({ name: 'save_measurement', input: { kind: DM.kindFromUnit(m.unit), label: m.label || DM.MEASURE_KINDS[DM.kindFromUnit(m.unit)].label,
                value: m.value, unit: m.unit, comment: 'Donnée hors contrôle : ' + text.slice(0, 120), source: 'technicien' } });
            });
          }
        }
      }
      if (notes.unitMismatch) {
        // rien d'autre : le contrôle en cours sera redemandé
      } else if (measures.length && !attachedMeasure && !isFeederTest) {
        measures.forEach(function (m) {
          calls.push({ name: 'save_measurement', input: { kind: DM.kindFromUnit(m.unit), label: (m.label ? m.label + ' — ' : '') + shortLabel(ctl.description),
            value: m.value, unit: m.unit, location: ctl.location, control_id: ctl.id, source: 'technicien' } });
        });
      }
      if (!DM.hasResult(ctl) && !attachedControl && !notes.unitMismatch) {
        const v = verdictFrom(text);
        const nt = DM.normText(text);
        // interprétation automatique, uniquement à partir de ce que le technicien a écrit
        let auto = null;
        if (isFeederTest) {
          const f = DM.agent.analyzeFeeders(text);
          if (f) auto = { verdict: f.found ? 'non_conforme' : 'conforme', summary: f.summary, feeders: f };
        }
        if (!auto && measures.length && DM.controlMeasureKinds(ctl).indexOf('isolement') !== -1) {
          const ins = DM.agent.analyzeInsulation(measures);
          // une valeur qui fluctue signe un défaut franc intermittent, même si elle passe parfois au-dessus du seuil
          if (ins && !ins.abnormal && DM.hasKeyword(nt, 'instable')) { ins.abnormal = true; ins.summary += ' Valeur instable : défaut intermittent.'; }
          if (ins) auto = { verdict: ins.abnormal ? 'non_conforme' : 'conforme', summary: ins.summary, insulation: ins };
        }
        if (!auto && measures.length >= 2) {
          // série de valeurs (par phase, par pôle…) : le verdict découle du calcul d'écart, sans rien inventer
          const series = DM.agent.analyzeSeries(measures);
          const expectsBalance = /équilibr|equilibr|écart|ecart|identique|homog/i.test(ctl.expected || '');
          // des valeurs homogènes ne suffisent pas quand l'attendu fixe aussi un seuil (« … et inférieurs à l'intensité de la plaque ») :
          // le calcul d'écart est annoncé, mais c'est le technicien qui compare à la plaque
          const hasThreshold = /plaque|nominal/i.test(ctl.expected || '');
          // le calcul d'écart ne vaut verdict que si le contrôle attend des valeurs homogènes (phases, pôles, enroulements)
          if (series && expectsBalance && (series.abnormal || !hasThreshold)) auto = { verdict: series.abnormal ? 'non_conforme' : 'conforme', summary: series.summary, series: series };
          else if (series && expectsBalance && !v) notes.seriesNote = series.summary;
        }
        if (auto) {
          const obtained = auto.summary === 'Anomalie constatée.' ? text : text + ' — ' + auto.summary;
          calls.push({ name: 'record_control_result', input: { control_id: ctl.id, obtained: obtained, verdict: auto.verdict, conclusion: auto.summary } });
          notes.result = { controlId: ctl.id, verdict: auto.verdict, obtained: obtained, series: auto.series, feeders: auto.feeders,
            insulation: auto.insulation, summary: auto.summary, unit: measures.length ? measures[0].unit : '' };
        } else if (v) {
          calls.push({ name: 'record_control_result', input: { control_id: ctl.id, obtained: text, verdict: v } });
          notes.result = { controlId: ctl.id, verdict: v, obtained: text };
          // zone désignée par le technicien (« Tronçon 2.31 à 2.39 : défaut ») : mémorisée pour la suite et le diagnostic
          // (un repère chiffré est exigé, et « défaut terre / de communication » n'est pas une zone)
          const zone = v === 'non_conforme' && text.match(/([^·;:\n]{3,50}?)\s*:\s*(?:en\s+)?d[ée]faut\b(?!\s*(?:terre|de\s+comm))/i);
          if (zone && /\d/.test(zone[1])) calls.push({ name: 'record_fact', input: { question: 'Zone en défaut', answer: zone[1].trim(), source: 'mesure' } });
        } else if (!/^\s*(je ne sais pas|sais pas)/i.test(text)) notes.awaitVerdict = ctl.id;
      }
    } else if (ask && ask.kind === 'confirm' && ask.hypothesisId && DM.findHyp(d, ask.hypothesisId)) {
      const yes = yesNo(text);
      const h = DM.findHyp(d, ask.hypothesisId);
      if (yes === true) {
        // repères de composants cités dans les preuves (KM3, Q1, F2…) : le diagnostic nomme l'élément en cause
        // départ identifié + repères cités dans les deux dernières preuves (la localisation progresse de preuve en preuve)
        const tags = [];
        const feeder = DM.findFact(d, 'Départ en défaut');
        if (feeder) tags.push(feeder.answer.split(/\s/)[0]);
        const zone = DM.findFact(d, 'Zone en défaut');
        if (zone) tags.push(zone.answer);
        h.evidence.slice(-2).forEach(function (e) {
          (e.text.match(/\b(?:KM|KA|K|Q|QF|F|X|BJ|BD|CJ)\d{1,3}\b/g) || []).forEach(function (t) { if (tags.indexOf(t) === -1) tags.push(t); });
        });
        const summary = h.cause + (tags.length ? ' — ' + tags.join(', ') : '');
        calls.push({ name: 'upsert_hypothesis', input: { id: h.id, status: 'confirmee', justification: 'Confirmée par le technicien après des contrôles non conformes concordants.' } });
        calls.push({ name: 'set_diagnosis_status', input: { status: 'confirme', summary: summary, missing: [] } });
        calls.push({ name: 'suggest_report', input: {} });
        notes.confirmed = h.id;
      } else if (yes === false) {
        notes.notConfirmed = h.id;
        calls.push({ name: 'record_fact', input: { question: 'Confirmation de « ' + h.cause + ' »', answer: 'Non — le technicien veut poursuivre les contrôles', source: 'technicien' } });
      }
    } else if (ask && (ask.kind === 'fact' || ask.kind === 'open') && ask.question) {
      calls.push({ name: 'record_fact', input: { question: ask.question, answer: normalizeAnswer(text), source: 'technicien' } });
      if (ask.factId === 'code' && yesNo(text) === true && !DM.extractErrorCodes(text).length) notes.askCodeValue = true;
    }

    // matériel cité dans le message
    const eq = {};
    const brand = detectBrand(text);
    if (brand && DM.normalize(brand) !== DM.normalize(d.brand)) eq.brand = brand;
    const type = detectType(n);
    if (type && d.installationType === 'autre') eq.installation_type = type;
    const ref = detectReference(text) || (ask && ask.factId === 'reference' && /[0-9]/.test(text) && /[A-Za-z]/.test(text) && s(text).split(/\s+/).length <= 3 ? s(text).toUpperCase() : null);
    if (ref && ref !== d.reference) eq.reference = ref;
    if (Object.keys(eq).length) calls.push({ name: 'update_equipment', input: Object.assign(eq, { source: 'technicien' }) });

    if (!d.description && text && !attachedMeasure) {
      calls.push({ name: 'set_fault', input: { description: text, symptoms_add: [text.length > 90 ? text.slice(0, 87) + '…' : text] } });
      // durée déjà donnée dans la description : mémorisée, la question ne sera pas posée
      const dur = text.match(DURATION_RE);
      if (dur) calls.push({ name: 'record_fact', input: { question: QUESTIONS[0].question, answer: dur[1] + ' (d’après la description)', source: 'technicien' } });
      if (!d.name || /^Diagnostic du /.test(d.name)) {
        const title = [brand || d.brand, text.length > 50 ? text.slice(0, 47) + '…' : text].filter(Boolean).join(' — ');
        calls.push({ name: 'update_equipment', input: { name: title } });
      }
    }
    const prot = protectionMention(text);
    if (prot && !DM.findFact(d, 'Protection qui déclenche')) calls.push({ name: 'record_fact', input: { question: 'Protection qui déclenche', answer: prot, source: 'technicien' } });
    const codes = DM.extractErrorCodes(text);
    if (codes.length) {
      calls.push({ name: 'record_fact', input: { question: 'Code défaut affiché', answer: codes.join(', '), source: 'technicien' } });
      calls.push({ name: 'set_fault', input: { symptoms_add: codes.map(function (x) { return 'Code défaut ' + x; }) } });
    }

    // mesures citées hors d'un contrôle attendu : rattachées au prochain contrôle
    // (pas dans la description initiale ni dans une réponse à une question : ce sont des données, pas des mesures)
    if (d.description && (!ask || ask.kind === 'open') && measures.length && !attachedMeasure) {
      const next = DM.nextControl(d);
      measures.forEach(function (m) {
        calls.push({ name: 'save_measurement', input: { kind: DM.kindFromUnit(m.unit), label: next ? shortLabel(next.description) : DM.MEASURE_KINDS[DM.kindFromUnit(m.unit)].label,
          value: m.value, unit: m.unit, control_id: next ? next.id : undefined, source: 'technicien' } });
      });
      if (next && !DM.hasResult(next)) notes.awaitVerdict = next.id;
    }
    if (attachedMeasure) {
      const mid = c.attachments.find(function (a) { return a.type === 'measurement'; }).id;
      const mm = DM.findMeasurement(d, mid);
      if (mm && mm.controlId && !DM.hasResult(DM.findControl(d, mm.controlId))) {
        if (mm.result) {
          calls.push({ name: 'record_control_result', input: { control_id: mm.controlId, obtained: mm.value + (mm.unit ? ' ' + mm.unit : ''), verdict: mm.result } });
          notes.result = { controlId: mm.controlId, verdict: mm.result, obtained: mm.value + ' ' + mm.unit };
        } else notes.awaitVerdict = mm.controlId;
      }
    }
    if (attachedControl) {
      const cid = c.attachments.find(function (a) { return a.type === 'control'; }).id;
      const ctl = DM.findControl(d, cid);
      if (ctl && DM.hasResult(ctl)) notes.result = { controlId: ctl.id, verdict: ctl.verdict, obtained: ctl.obtained };
    }
    // première description : consulter l'historique (une fois)
    if (!d.description && text && !this.notes.kbCallId && d.messages.length <= 2) {
      this.notes.kbCallId = 'pending';
    }
    return { calls: calls };
  };

  /* 2. Évaluation d'un résultat de contrôle */
  LocalProvider.prototype.evaluate = function (d) {
    const r = this.notes.result;
    const calls = [];
    if (this.notes.kbCallId === 'pending') {
      calls.push({ name: 'search_previous_diagnostics', input: { mode: 'similaire', text: d.description + ' ' + d.symptoms } });
      this.notes.kbCallId = 'local_' + (this.counter + 1);
    }
    if (!r) return { calls: calls };
    const ctl = DM.findControl(d, r.controlId);
    let h = ctl && ctl.hypothesisId ? DM.findHyp(d, ctl.hypothesisId) : null;
    // la preuve garde les mots du technicien (repères KM3, L3…) suivis du calcul éventuel
    const fact = 'Contrôle « ' + shortLabel(ctl.description) + ' » : ' + r.obtained;
    const alive = d.hypotheses.filter(function (x) { return x.status !== 'ecartee'; });

    // courants par phase : la série est recalculée à partir des mesures enregistrées quand le verdict vient du technicien
    if (!r.series && /chaque phase/.test(DM.normalize(ctl.description))) {
      const ms = DM.measurementsOf(d, ctl.id).filter(function (m) { return DM.kindFromUnit(m.unit) === 'courant'; });
      const series = DM.agent.analyzeSeries(ms.map(function (m) { return { value: m.value, unit: m.unit, label: s(m.label).split(' — ')[0] }; }));
      if (series) { r.series = series; r.unit = ms[0].unit; }
    }
    const isSurcharge = function (x) { return /surcharge|surintensit/.test(DM.normalize(x.cause)); };
    const isLocalized = function (x) { return /contact|pole|enroulement|phase|desequilibr|connexion/.test(DM.normalize(x.cause)); };
    // déséquilibre de courant entre phases : défaut électrique localisé plutôt qu'une surcharge globale
    if (r.verdict === 'non_conforme' && r.series && r.series.abnormal && DM.kindFromUnit(r.unit) === 'courant') {
      const localized = alive.filter(isLocalized);
      const self = this;
      alive.filter(isSurcharge).forEach(function (x) {
        const t = fact + ' — une surcharge mécanique chargerait les trois phases de la même façon.';
        calls.push({ name: 'upsert_hypothesis', input: { id: x.id, counter_evidence_add: [t] } });
        (self.notes.lessLikely = self.notes.lessLikely || []).push({ cause: x.cause, why: 'une surcharge mécanique chargerait les trois phases de la même façon' });
      });
      if (localized.length && (!h || isSurcharge(h))) h = localized[0];
    }
    // trois courants élevés mais équilibrés : c'est la charge qui est en cause, pas un pôle ni une phase
    if (r.verdict === 'non_conforme' && r.series && !r.series.abnormal && DM.kindFromUnit(r.unit) === 'courant') {
      const overload = alive.filter(isSurcharge);
      const self = this;
      if (overload.length) {
        alive.filter(function (x) { return isLocalized(x) && !isSurcharge(x); }).forEach(function (x) {
          const t = fact + ' — courants équilibrés : un pôle ou une phase en défaut déséquilibrerait les courants.';
          calls.push({ name: 'upsert_hypothesis', input: { id: x.id, counter_evidence_add: [t] } });
          (self.notes.lessLikely = self.notes.lessLikely || []).push({ cause: x.cause, why: 'les trois courants sont équilibrés' });
        });
        if (!h || !isSurcharge(h)) h = overload[0];
      }
    }

    // ouverture successive des départs (IT) : le départ en défaut est identifié ; les pistes liées aux départs sains sont écartées
    if (r.feeders && r.feeders.found) {
      const self = this;
      const segs = feederSegments([d.description, d.symptoms].concat(d.facts.map(function (f) { return f.answer; })).join('\n'));
      const healthy = r.feeders.feeders.filter(function (f) { return f.id !== r.feeders.found; });
      const discarded = [];
      alive.forEach(function (x) {
        const words = subjectWords(x.cause);
        if (!words.length) return;
        const f = healthy.find(function (hf) { return segs[hf.id] && words.some(function (w) { return DM.hasKeyword(DM.normText(segs[hf.id]), w); }); });
        if (!f) return;
        calls.push({ name: 'upsert_hypothesis', input: { id: x.id, status: 'ecartee',
          counter_evidence_add: ['Ouverture de ' + f.id + ' (' + segs[f.id] + ') : ' + f.text + ' — le défaut n’est pas sur ce départ.'],
          justification: 'Le départ ' + f.id + ' n’est pas celui qui porte le défaut.' } });
        discarded.push(x.id);
        (self.notes.discardedList = self.notes.discardedList || []).push(x.cause + ' (' + f.id + ' : ' + f.text + ')');
      });
      calls.push({ name: 'record_fact', input: { question: 'Départ en défaut', answer: r.feeders.found + (segs[r.feeders.found] ? ' — ' + segs[r.feeders.found] : ''), source: 'mesure' } });
      const target = alive.find(function (x) { return discarded.indexOf(x.id) === -1 && /isolement/.test(DM.normalize(x.cause)) && !subjectWords(x.cause).length; });
      if (target) h = target;
    }
    if (!h) return { calls: calls };

    const tplH = findTemplate(this, h);
    const tctlH = tplH ? tplH.controls.find(function (c) { return DM.normalize(c.description) === DM.normalize(ctl.description); }) : null;
    // contrôle à « signature » : une anomalie qui ne porte aucun des signes attendus ne désigne pas cette cause
    if (r.verdict === 'non_conforme' && tctlH && tctlH.signe && !has(DM.normText(r.obtained), tctlH.signe)) {
      calls.push({ name: 'upsert_hypothesis', input: { id: h.id, status: 'ecartee', counter_evidence_add: [fact + ' (anomalie sans rapport avec cette piste)'],
        justification: 'Le résultat est anormal, mais ne désigne pas cette cause.' } });
      this.notes.discarded = h.cause;
      this.notes.unrelated = true;
      return { calls: calls };
    }
    if (r.verdict === 'non_conforme') {
      calls.push({ name: 'upsert_hypothesis', input: { id: h.id, status: 'suspectee', evidence_add: [fact + ' (non conforme)'] } });
      const nonConf = DM.controlsOf(d, h.id).filter(function (x) { return DM.hasResult(x) && x.verdict === 'non_conforme'; }).length +
        (ctl.hypothesisId === h.id ? 0 : 1);
      const tpl = findTemplate(this, h);
      const remaining = remainingControls(d, tpl, ctl);
      calls.push({ name: 'set_diagnosis_status', input: { status: 'probable', summary: h.cause,
        missing: remaining ? ['Contrôle complémentaire pour confirmer « ' + h.cause + ' »'] : ['Confirmation de la cause « ' + h.cause + ' »'] } });
      // on ne propose de confirmer qu'une fois tous les contrôles prévus pour cette piste réalisés
      // (le dernier est le contrôle de confirmation) : jamais de réparation définitive sur un simple faisceau d'indices
      if (!remaining) this.notes.toConfirm = h.id;
      else this.notes.suspect = h.id;
      this.notes.nonConf = nonConf;
    } else if (r.verdict === 'conforme') {
      const tpl = findTemplate(this, h);
      const tctl = tpl ? tpl.controls.find(function (c) { return DM.normalize(c.description) === DM.normalize(ctl.description); }) : null;
      if (tctl && tctl.localize) {
        // contrôle de localisation : un résultat sain resserre la zone de recherche, il ne contredit pas la piste
        calls.push({ name: 'upsert_hypothesis', input: { id: h.id, evidence_add: [fact + ' → ' + tctl.onConform] } });
        this.notes.localized = tctl.onConform;
        // dernier contrôle de la piste, et un contrôle précédent était non conforme : la piste peut être confirmée
        const hadNc = DM.controlsOf(d, h.id).some(function (x) { return DM.hasResult(x) && x.verdict === 'non_conforme'; });
        if (!remainingControls(d, tpl, ctl)) {
          if (hadNc) {
            // on ne propose de confirmer tout de suite que s'il ne reste aucune autre piste à contrôler (sinon, elles passent d'abord)
            const othersPending = DM.pendingControls(d).some(function (c) { return c.id !== ctl.id && c.hypothesisId !== h.id; });
            if (!othersPending) this.notes.toConfirm = h.id;
          } else {
            calls.push({ name: 'upsert_hypothesis', input: { id: h.id, status: 'ecartee', justification: 'Tous les contrôles de cette piste sont conformes.' } });
            this.notes.discarded = h.cause;
          }
        }
      } else {
        const others = DM.controlsOf(d, h.id).filter(function (x) { return x.id !== ctl.id && !DM.hasResult(x); });
        const input = { id: h.id, counter_evidence_add: [fact + ' (conforme)'] };
        if (!others.length) { input.status = 'ecartee'; input.justification = 'Contrôle conforme : ' + r.obtained; this.notes.discarded = h.cause; }
        calls.push({ name: 'upsert_hypothesis', input: input });
      }
    }
    return { calls: calls };
  };

  /** Nombre de contrôles du gabarit qui restent à faire (un contrôle déjà réalisé pour une autre piste compte comme fait). */
  function remainingControls(d, tpl, current) {
    if (!tpl) return 0;
    const done = d.controls.filter(function (x) { return DM.hasResult(x) || (current && x.id === current.id); })
      .map(function (x) { return DM.normalize(x.description); });
    return tpl.controls.filter(function (c) { return done.indexOf(DM.normalize(c.description)) === -1; }).length;
  }

  /** Description de chaque départ citée par le technicien : « D3 pompe P2 variateur… » → {D3: 'pompe P2 variateur…'} */
  function feederSegments(text) {
    const out = {};
    const re = /\b(D\d+)\s*[:=\-–]?\s*([^,;\n·]+)/g;
    let m;
    while ((m = re.exec(String(text || '')))) {
      const seg = m[2].trim().replace(/[.\s]+$/, '');
      if (!out[m[1].toUpperCase()] && seg && !/^\d/.test(seg)) out[m[1].toUpperCase()] = seg;
    }
    return out;
  }
  /** Mots qui désignent le « sujet » matériel d'une hypothèse (variateur, chauffage…), pour la rattacher à un départ. */
  function subjectWords(cause) {
    const n = DM.normalize(cause);
    if (/variateur|cem/.test(n)) return ['variateur'];
    if (/chauff|resistance|radiateur/.test(n)) return ['chauffage', 'chauff', 'radiateur', 'resistance'];
    if (/eclairage/.test(n)) return ['eclairage'];
    return [];
  }

  /** Modèle de la base de pannes correspondant à une hypothèse (par sa cause). */
  function findTemplate(self, h) {
    return (self.notes.templates || {})[DM.normalize(h.cause)] ||
      Object.keys(DM.KB).reduce(function (found, k) { return found || DM.KB[k].find(function (t) { return DM.normalize(t.cause) === DM.normalize(h.cause); }); }, null);
  }

  /* 3. Questions essentielles (une seule par tour) */
  LocalProvider.prototype.essentials = function (d) {
    if (this.notes.result || this.notes.awaitVerdict || this.notes.confirmed || this.notes.toConfirm) return null;
    if (d.controls.some(DM.hasResult)) return null; // la recherche est engagée : on ne revient pas aux questions d'ouverture
    if (this.notes.askCodeValue) { this.notes.question = { question: 'Quel code défaut exactement ?', choices: [], kind: 'fact', factId: 'code_valeur' }; return null; }
    const raw = [d.description, d.symptoms].join(' ');
    const n = DM.normText(raw);
    for (let i = 0; i < QUESTIONS.length; i++) {
      const q = QUESTIONS[i];
      if (DM.findFact(d, q.question)) continue;
      if (q.id === 'differentiel' && d.facts.some(function (f) { return /differentiel/.test(DM.normalize(f.question)); })) continue;
      if (q.when(n, d, raw)) { this.notes.question = { question: q.question, choices: q.choices, kind: 'fact', factId: q.id }; return null; }
    }
    return null;
  };

  /* 4. Hypothèses depuis la base de pannes */
  LocalProvider.prototype.hypotheses = function (d) {
    if (this.notes.question || !d.description) return null;
    // une piste que le technicien a refusé de confirmer ne bloque pas la recherche d'autres pistes
    const alive = d.hypotheses.filter(function (h) { return h.status !== 'ecartee' && !DM.findFact(d, 'Confirmation de « ' + h.cause + ' »'); });
    if (alive.length) return null;
    const sug = DM.suggestHypotheses(d);
    const relevant = sug.filter(function (x) { return x.score > 0; });
    // 2 à 3 pistes : les pertinentes d'abord, complétées par les plus courantes pour ce type d'installation
    const pick = relevant.slice(0, 3);
    // sans aucun indice au départ, on commence par les pannes les plus courantes du domaine ;
    // une fois les pistes pertinentes épuisées, on ne déroule pas toute la base : on redemande des observations
    if (!d.hypotheses.length) sug.forEach(function (x) { if (pick.length < 2 && pick.indexOf(x) === -1) pick.push(x); });
    // un résultat anormal resté sans explication appelle les causes qui prévoient ce même contrôle
    if (!pick.length) {
      const abnormal = d.controls.filter(function (c) { return DM.hasResult(c) && c.verdict === 'non_conforme'; }).map(function (c) { return DM.normalize(c.description); });
      sug.forEach(function (x) {
        if (pick.length < 2 && x.template.controls.some(function (c) { return abnormal.indexOf(DM.normalize(c.description)) !== -1; })) pick.push(x);
      });
    }
    if (!pick.length) return null;
    const self = this;
    self.notes.templates = {};
    const calls = pick.map(function (x) {
      self.notes.templates[DM.normalize(x.template.cause)] = x.template;
      return { name: 'upsert_hypothesis', input: {
        cause: x.template.cause,
        reason: x.template.reason + (x.matched.length ? ' Indices : ' + x.matched.join(', ') + '.' : ''),
        status: 'possible'
      } };
    });
    this.notes.newHypotheses = true;
    return { calls: calls };
  };

  /* 5. Plan de contrôle : premier contrôle type de chaque hypothèse vivante qui n'en a pas */
  LocalProvider.prototype.controls = function (d) {
    if (this.notes.question) return null;
    const self = this;
    const calls = [];
    // contrôles déjà présents dans le diagnostic (toutes pistes) : jamais reproposés
    const existing = d.controls.map(function (c) { return DM.normalize(c.description); });
    let alive = 0;
    d.hypotheses.forEach(function (h) {
      if (h.status === 'ecartee') return;
      if (DM.controlsOf(d, h.id).some(function (c) { return !DM.hasResult(c); })) { alive++; return; }
      const tpl = findTemplate(self, h);
      if (!tpl) { alive++; return; }
      let dead = false;
      // un contrôle du gabarit déjà réalisé pour une autre piste n'est pas redemandé : son résultat est repris ici
      tpl.controls.forEach(function (tc) {
        const done = d.controls.find(function (c) { return DM.hasResult(c) && c.hypothesisId !== h.id && DM.normalize(c.description) === DM.normalize(tc.description); });
        if (!done || done.verdict === 'indetermine') return;
        const tag = 'Contrôle « ' + shortLabel(done.description) + ' »';
        if (h.evidence.concat(h.counterEvidence).some(function (e) { return e.text.indexOf(tag) === 0; })) return;
        const fact = tag + ' : ' + done.obtained + ' (déjà réalisé)';
        if (done.verdict === 'non_conforme') calls.push({ name: 'upsert_hypothesis', input: { id: h.id, evidence_add: [fact] } });
        else if (tc.localize) calls.push({ name: 'upsert_hypothesis', input: { id: h.id, evidence_add: [fact + ' → ' + tc.onConform] } });
        else if (!dead) {
          calls.push({ name: 'upsert_hypothesis', input: { id: h.id, status: 'ecartee', counter_evidence_add: [fact], justification: 'Contrôle déjà réalisé, conforme : ' + done.obtained } });
          dead = true;
        }
      });
      if (dead) return;
      alive++;
      const next = tpl.controls.find(function (c) { return existing.indexOf(DM.normalize(c.description)) === -1; });
      if (!next) return;
      existing.push(DM.normalize(next.description));
      calls.push({ name: 'propose_control', input: {
        hypothesis_id: h.id, description: next.description, type: next.type, expected: next.expected,
        why: next.why || 'Vérifier l’hypothèse « ' + h.cause + ' ».'
      } });
    });
    // toutes les pistes viennent d'être écartées par des résultats déjà connus : on repart chercher d'autres pistes (sans boucler)
    if (!alive && calls.length && d.description && !this.notes.toConfirm && !this.notes.confirmed && (this.notes.rounds = (this.notes.rounds || 0) + 1) <= 4) this.stage = 3;
    return { calls: calls };
  };

  /* 6. Réponse (et question unique) */
  LocalProvider.prototype.compose = function (d) {
    const notes = this.notes;
    const parts = [];
    const calls = [];
    let ask = null;
    if (notes.kbText) parts.push('📚 Diagnostic(s) similaire(s) dans l’historique :\n' + notes.kbText);
    if (notes.photo) {
      parts.push('📷 Photo enregistrée. Je ne peux pas l’analyser en mode local (l’analyse d’image nécessite l’IA en ligne) : ' +
        'si elle montre une référence ou un code défaut, écris-le moi.');
    }

    if (notes.confirmed) {
      const h = DM.findHyp(d, notes.confirmed);
      const tplC = findTemplate(this, h);
      parts.push('✅ **Diagnostic confirmé : ' + (d.verdict.summary || h.cause) + '.**' +
        (tplC && tplC.advice ? '\n**Réparation conseillée :** ' + tplC.advice : '') +
        // pistes restées sans contrôle : signalées, car elles peuvent être des problèmes distincts (ex. fausse alarme d'un détecteur)
        (function () {
          const open = d.hypotheses.filter(function (x) { return x.id !== h.id && x.status === 'possible' && !DM.controlsOf(d, x.id).some(DM.hasResult); });
          return open.length ? '\n**Non vérifié, à traiter séparément si le symptôme existe :** ' + open.map(function (x) { return x.cause; }).join(' ; ') + '.' : '';
        })() +
        '\nTu peux procéder à la réparation. Décris-moi ensuite ce qui a été fait (pièces remplacées, réglages) ; le rapport est prêt à être généré.');
      return this.finish(parts, null);
    }
    if (notes.result && notes.result.summary && notes.result.summary !== 'Anomalie constatée.') {
      parts.push((notes.result.feeders ? '🔎 ' : '📏 ') + notes.result.summary);
    }
    if (notes.discardedList && notes.discardedList.length) {
      parts.push('Pistes **écartées** :\n' + notes.discardedList.map(function (t) { return '- ' + t; }).join('\n'));
    }
    if (notes.localized) parts.push('Résultat sain : ' + notes.localized);
    if (notes.suspect && !notes.toConfirm) {
      const hs = DM.findHyp(d, notes.suspect);
      parts.push('Résultat **non conforme** : la piste « ' + hs.cause + ' » devient **suspectée**. Un contrôle complémentaire va la confirmer ou l’écarter.');
    }
    // pistes affaiblies par le résultat de ce tour (annoncées une seule fois)
    (notes.lessLikely || []).forEach(function (x) { parts.push('La piste « ' + x.cause + ' » devient peu probable : ' + x.why + '.'); });
    // plus aucun contrôle à faire : une piste restée suspectée, dont tous les contrôles sont faits, est proposée à la confirmation
    if (!notes.toConfirm && !notes.awaitVerdict && !notes.unitMismatch && !notes.question && !DM.nextControl(d)) {
      const self = this;
      const cand = d.hypotheses.find(function (x) {
        return x.status === 'suspectee' && !DM.findFact(d, 'Confirmation de « ' + x.cause + ' »') &&
          DM.controlsOf(d, x.id).some(function (c) { return DM.hasResult(c) && c.verdict === 'non_conforme'; }) &&
          !remainingControls(d, findTemplate(self, x), null);
      });
      if (cand) { notes.toConfirm = cand.id; notes.lateConfirm = true; }
    }
    if (notes.toConfirm) {
      const h = DM.findHyp(d, notes.toConfirm);
      parts.push(notes.lateConfirm
        ? 'Les autres pistes sont écartées : il reste « ' + h.cause + ' », appuyée par un contrôle non conforme (diagnostic probable).'
        : 'Résultat **non conforme** : l’hypothèse « ' + h.cause + ' » devient **suspectée** (diagnostic probable).');
      // version courte pour le téléphone (le détail complet est dans le panneau et le rapport)
      if (h.evidence.length > 1) {
        parts.push('Éléments concordants :\n' + h.evidence.map(function (e) {
          const t = e.text.replace(/^Contrôle « ([^»]+) » : /, '$1 : ');
          const cut = t.indexOf(' — ');
          const short = cut > 0 ? t.slice(0, t.indexOf(':') + 1) + ' ' + t.slice(cut + 3) : t;
          return '- ' + (short.length > 150 ? short.slice(0, 147) + '…' : short);
        }).join('\n'));
      }
      ask = { question: 'Ce résultat suffit-il à expliquer la panne ? Si oui, je la confirme.', choices: ['Oui, confirmer', 'Non, continuer'], kind: 'confirm' };
      ask.hypothesisId = h.id;
      return this.finish(parts, ask);
    }
    if (notes.discarded && notes.unrelated) parts.push('Résultat anormal, mais qui ne désigne pas la cause « ' + notes.discarded + ' » : je l’**écarte** et je garde ce constat pour la suite.');
    else if (notes.discarded) parts.push('Résultat conforme : je **écarte** la piste « ' + notes.discarded + ' ».');
    else if (notes.result && notes.result.verdict === 'conforme' && !notes.localized) parts.push('Résultat conforme, noté.');
    if (notes.notConfirmed) parts.push('D’accord, je ne confirme pas encore : poursuivons les contrôles.');

    if (notes.unitMismatch) {
      const u = notes.unitMismatch;
      parts.push('Cette valeur (' + u.unit + ' : ' + u.kind + ') ne correspond pas au contrôle demandé' + (u.expected ? ' (' + u.expected + ')' : '') +
        '. Je la note à part, sans la rattacher à ce contrôle.');
      return this.finish(parts, { question: 'Donne-moi le résultat du contrôle « ' + shortLabel(u.ctl.description) + ' ».', choices: ['Je ne peux pas le faire'],
        kind: 'result', control_id: u.ctl.id });
    }
    if (notes.awaitVerdict) {
      const ctl = DM.findControl(d, notes.awaitVerdict);
      const ms = DM.measurementsOf(d, ctl.id);
      if (notes.relinked === ctl.id) parts.push('Cette valeur ne correspond pas au contrôle demandé : je la rattache au contrôle « ' + ctl.description + ' ».');
      parts.push('📏 Noté : ' + (ms.length ? ms.map(DM.formatMeasurement).join(' ; ') : 'résultat reçu') + '.' +
        (notes.seriesNote ? '\n' + notes.seriesNote : '') +
        (ctl.expected ? '\nRésultat attendu : ' + noDot(ctl.expected) + '.' : ''));
      return this.finish(parts, { question: 'Par rapport à l’attendu, ce résultat est-il conforme ?', choices: ['Conforme', 'Non conforme', 'Je ne sais pas'], kind: 'verdict', control_id: ctl.id });
    }
    if (notes.question) {
      if (!d.messages.some(function (m) { return m.role === 'assistant'; })) parts.push('D’accord, je note la panne.');
      return this.finish(parts, notes.question);
    }
    if (notes.newHypotheses) {
      const alive = d.hypotheses.filter(function (h) { return h.status !== 'ecartee'; });
      parts.push('Pistes à vérifier : ' + alive.map(function (h) { return h.cause; }).join(' ; ') + '. Commençons par le contrôle le plus simple.');
    }
    const next = DM.nextControl(d);
    if (next) {
      const r = DM.riskLevel(next, d.installationType);
      const n = d.controls.filter(DM.hasResult).length + 1;
      const h = next.hypothesisId ? DM.findHyp(d, next.hypothesisId) : null;
      let t = '**Contrôle n°' + n + ' :** ' + next.description;
      if (next.why || h) t += '\n*Pourquoi :* ' + (next.why || 'vérifier « ' + h.cause + ' »');
      if (next.expected) t += '\n*Résultat attendu :* ' + noDot(next.expected) + '.';
      if (r.level >= 2) t += '\n⚠️ **RISQUE — ' + r.label + '.** ' + r.precautions.slice(0, 2).join(' ');
      parts.push(t);
      return this.finish(parts, { question: 'Donne-moi la valeur mesurée ou le résultat constaté.', choices: [], kind: 'result', control_id: next.id });
    }
    if (d.hypotheses.length && !DM.canClose(d)) {
      const missing = ['Un contrôle permettant de départager les pistes restantes', 'Une nouvelle observation ou mesure du technicien'];
      calls.push({ name: 'set_diagnosis_status', input: { status: 'non_confirme', summary: 'Pistes de la base locale épuisées', missing: missing } });
      parts.push('Je ne peux pas conclure avec les contrôles réalisés : les pistes de ma base locale sont écartées. Il me manque une observation supplémentaire (bruit, odeur, code défaut, conditions d’apparition). Décris-moi ce que tu constates, ou reconnecte-toi pour que l’IA approfondisse.');
      // la réponse est mémorisée comme observation : elle peut faire apparaître de nouvelles pistes
      const n = d.facts.filter(function (f) { return /^Observation complémentaire/.test(f.question); }).length;
      calls.push({ name: 'ask_user', input: { question: 'Observation complémentaire n°' + (n + 1) + ' : que constates-tu d’autre ?', choices: [], kind: 'open' } });
      return { calls: calls, text: parts.join('\n\n') };
    }
    if (!d.description) return this.finish(['Décris-moi la panne. Tu peux également ajouter une photo.'], null);
    if (d.installationType === 'autre') {
      return this.finish(parts, { question: 'De quel type d’installation s’agit-il ?', choices: ['Climatisation', 'Électricité', 'Moteur', 'Pompe'], kind: 'fact' });
    }
    return this.finish(parts.concat(['Décris-moi ce que tu constates pour poursuivre.']), null);
  };

  LocalProvider.prototype.finish = function (parts, ask) {
    let text = parts.filter(Boolean).join('\n\n');
    if (ask) {
      text += (text ? '\n\n' : '') + ask.question;
      const input = { question: ask.question, choices: ask.choices || [], kind: ask.kind || 'open' };
      if (ask.control_id) input.control_id = ask.control_id;
      this.extraAsk = { factId: ask.factId || null, hypothesisId: ask.hypothesisId || null };
      return { calls: [{ name: 'ask_user', input: input }], text: text };
    }
    return { text: text };
  };

  DM.agent.LocalProvider = LocalProvider;

  /** Tour d'agent avec le moteur local (nouvelle instance à chaque tour : le moteur est à état). */
  DM.agent.runLocalTurn = function (p) {
    return DM.agent.runTurn(Object.assign({}, p, { provider: new LocalProvider() }));
  };
})(window.DM);
