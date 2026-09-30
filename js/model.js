/* DIAG-MAINT — modèle métier du diagnostic (sans DOM, exécutable navigateur + Node).
 *
 * Arbre de diagnostic :
 *   SYMPTÔMES (diagnostic)
 *     └─ HYPOTHÈSE (parentControlId = null  → hypothèse racine)
 *          ├─ preuves / contre-preuves
 *          └─ CONTRÔLE (hypothesisId)
 *               └─ RÉSULTAT (obtained, mesures, verdict)
 *                    └─ nouvelle HYPOTHÈSE (parentControlId = id du contrôle) ...
 *   → VERDICT : non confirmé | probable | confirmé (confirmé uniquement avec une hypothèse
 *     confirmée par un résultat de contrôle)
 *
 * Les contrôles « généraux » ont hypothesisId = null.
 * Schéma 2 (V2) : mesures, faits (mémoire), conversation, verdict, pièces. Les diagnostics V1
 * sont migrés à la lecture par DM.normalizeDiag().
 */
(function (DM) {
  'use strict';

  const SCHEMA = 2;
  const now = function () { return new Date().toISOString(); };
  function touch(d) { d.updatedAt = now(); }
  function req(x, msg) { if (!x) throw new Error(msg); return x; }
  function str(v) { return v == null ? '' : String(v).trim(); }
  function arr(v) { return Array.isArray(v) ? v : []; }

  DM.DIAG_STATUS = {
    en_cours: { label: 'En cours', cls: 'progress' },
    cloture: { label: 'Clôturé', cls: 'ok' }
  };
  DM.HYP_STATUS = {
    possible: { label: 'Possible', cls: 'todo', symbol: '○' },
    suspectee: { label: 'Suspectée', cls: 'progress', symbol: '◐' },
    confirmee: { label: 'Confirmée', cls: 'ok', symbol: '✓' },
    ecartee: { label: 'Écartée', cls: 'ko', symbol: '✕' }
  };
  const LEGACY_HYP_STATUS = { a_verifier: 'possible', en_cours: 'suspectee' };
  DM.VERDICTS = {
    non_conforme: { label: 'Non conforme', cls: 'ko' },
    conforme: { label: 'Conforme', cls: 'ok' },
    indetermine: { label: 'Indéterminé', cls: 'todo' }
  };
  DM.VERDICT_STATUS = {
    non_confirme: { label: 'Diagnostic non confirmé', cls: 'todo' },
    probable: { label: 'Diagnostic probable', cls: 'progress' },
    confirme: { label: 'Diagnostic confirmé', cls: 'ok' }
  };
  DM.FINAL_RESULTS = {
    resolu: 'Panne résolue',
    partiel: 'Fonctionnement partiel / provisoire',
    non_resolu: 'Panne non résolue',
    attente: 'En attente de pièces / d’intervention'
  };
  DM.STEPS = ['Symptômes', 'Hypothèses', 'Contrôles', 'Résultats', 'Diagnostic'];

  DM.MEASURE_KINDS = {
    tension: { label: 'Tension', units: ['V', 'V AC', 'V DC', 'mV', 'kV'] },
    courant: { label: 'Courant', units: ['A', 'mA', 'kA'] },
    resistance: { label: 'Résistance', units: ['Ω', 'kΩ', 'MΩ', 'mΩ'] },
    continuite: { label: 'Continuité', units: ['', 'Ω'], choices: ['oui', 'non'] },
    isolement: { label: 'Isolement', units: ['MΩ', 'GΩ', 'kΩ'] },
    temperature: { label: 'Température', units: ['°C', 'K'] },
    pression: { label: 'Pression', units: ['bar', 'kPa', 'MPa', 'psi'] },
    frequence: { label: 'Fréquence', units: ['Hz', 'kHz'] },
    sonde: { label: 'Valeur de sonde', units: ['kΩ', 'Ω', '°C', 'mA', 'V'] },
    capacite: { label: 'Capacité', units: ['µF', 'nF'] },
    code: { label: 'Code erreur', units: [''] },
    ouinon: { label: 'Résultat oui/non', units: [''], choices: ['oui', 'non'] },
    commentaire: { label: 'Observation', units: [''] }
  };
  const UNIT_TO_KIND = {
    'v': 'tension', 'v ac': 'tension', 'v dc': 'tension', 'mv': 'tension', 'kv': 'tension', 'vac': 'tension', 'vdc': 'tension',
    'a': 'courant', 'ma': 'courant', 'ka': 'courant',
    'ω': 'resistance', 'kω': 'resistance', 'mω': 'resistance', 'ohm': 'resistance', 'ohms': 'resistance', 'kohm': 'resistance',
    'gω': 'isolement', 'mohm': 'isolement',
    '°c': 'temperature', 'k': 'temperature',
    'bar': 'pression', 'kpa': 'pression', 'mpa': 'pression', 'psi': 'pression',
    'hz': 'frequence', 'khz': 'frequence',
    'µf': 'capacite', 'uf': 'capacite', 'nf': 'capacite'
  };
  DM.kindFromUnit = function (unit) {
    const raw = String(unit || '').trim();
    // la casse compte : MΩ (mégohm → isolement) ≠ mΩ (milliohm → résistance)
    if (raw === 'MΩ' || /^Mohms?$/.test(raw)) return 'isolement';
    if (raw === 'mΩ') return 'resistance';
    return UNIT_TO_KIND[raw.toLowerCase()] || 'commentaire';
  };

  DM.PHOTO_KINDS = {
    tableau: 'Tableau électrique',
    plaque: 'Plaque signalétique',
    cablage: 'Câblage',
    appareil: 'Appareil',
    ecran_defaut: 'Écran de défaut',
    schema: 'Schéma',
    composant: 'Composant',
    installation: 'Installation générale',
    autre: 'Autre'
  };

  const INFO_FIELDS = ['name', 'installationType', 'brand', 'model', 'reference', 'serial', 'client', 'site', 'location', 'description', 'symptoms', 'date'];

  DM.validateInfo = function (f) {
    const errors = [];
    if (!str(f.name)) errors.push('Le nom du diagnostic est obligatoire.');
    if (!f.installationType || !DM.INSTALL_TYPES.some(function (t) { return t.id === f.installationType; })) errors.push('Choisissez un type d’installation.');
    if (!str(f.description)) errors.push('La description de la panne est obligatoire.');
    return errors;
  };

  function blankDiag(f) {
    const t = now();
    return {
      id: f.id || DM.uid('diag'), schema: SCHEMA, mode: f.mode || 'form',
      name: '', installationType: 'autre', brand: '', model: '', reference: '', serial: '',
      client: '', site: '', location: '',
      description: '', symptoms: '', date: DM.todayISO(),
      status: 'en_cours', photos: Array.isArray(f.photos) ? f.photos : [],
      hypotheses: [], controls: [], measurements: [], facts: [], messages: [], documents: [], parts: [],
      verdict: { status: 'non_confirme', summary: '', missing: [], at: null },
      finalDiagnosis: '', repair: '', recommendations: '', finalResult: '',
      createdAt: t, updatedAt: t, closedAt: null
    };
  }

  DM.createDiagnostic = function (f) {
    f = f || {};
    const errors = DM.validateInfo(f);
    if (errors.length) throw new Error(errors[0]);
    const d = blankDiag(f);
    INFO_FIELDS.forEach(function (k) { if (f[k] != null && f[k] !== '') d[k] = str(f[k]); });
    return d;
  };

  /** Diagnostic « brouillon » piloté par l'agent : les informations seront complétées au fil du chat. */
  DM.createDraft = function (f) {
    f = f || {};
    const d = blankDiag(Object.assign({ mode: 'agent' }, f));
    INFO_FIELDS.forEach(function (k) { if (f[k] != null && f[k] !== '') d[k] = str(f[k]); });
    if (!d.name) {
      const dt = new Date();
      d.name = 'Diagnostic du ' + DM.fmtDate(d.date) + ' ' + dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    return d;
  };

  /** Complète les champs manquants et migre les diagnostics V1 (idempotent). */
  DM.normalizeDiag = function (d) {
    if (!d || typeof d !== 'object') return d;
    const base = blankDiag({ id: d.id });
    Object.keys(base).forEach(function (k) {
      if (d[k] === undefined) d[k] = base[k];
    });
    ['photos', 'hypotheses', 'controls', 'measurements', 'facts', 'messages', 'documents', 'parts'].forEach(function (k) { d[k] = arr(d[k]); });
    if (!d.verdict || typeof d.verdict !== 'object') d.verdict = base.verdict;
    d.verdict.missing = arr(d.verdict.missing);
    d.hypotheses.forEach(function (h) {
      if (LEGACY_HYP_STATUS[h.status]) h.status = LEGACY_HYP_STATUS[h.status];
      if (!DM.HYP_STATUS[h.status]) h.status = 'possible';
      h.evidence = arr(h.evidence);
      h.counterEvidence = arr(h.counterEvidence);
      if (h.reason == null) h.reason = '';
      if (h.conclusion == null) h.conclusion = '';
    });
    d.controls.forEach(function (c) {
      ['why', 'location', 'obtained', 'measureValue', 'measureUnit', 'conclusion', 'expected'].forEach(function (k) { if (c[k] == null) c[k] = ''; });
      if (c.risk == null) c.risk = null;
      if (!c.proposedBy) c.proposedBy = 'user';
    });
    d.photos.forEach(function (p) { if (!p.kind) p.kind = 'autre'; });
    if (d.status === 'cloture' && d.verdict.status === 'non_confirme' && DM.canClose(d)) d.verdict.status = 'confirme';
    d.schema = SCHEMA;
    return d;
  };

  DM.updateInfo = function (d, f) {
    const merged = {};
    INFO_FIELDS.forEach(function (k) { merged[k] = f[k] !== undefined ? f[k] : d[k]; });
    const errors = DM.validateInfo(merged);
    if (errors.length) throw new Error(errors[0]);
    INFO_FIELDS.forEach(function (k) { d[k] = str(merged[k]); });
    if (Array.isArray(f.photos)) d.photos = f.photos;
    touch(d);
    return d;
  };

  /** Mise à jour partielle sans validation stricte (utilisée par l'agent). */
  DM.patchInfo = function (d, f) {
    const changed = [];
    INFO_FIELDS.forEach(function (k) {
      if (f[k] === undefined || f[k] === null) return;
      let v = str(f[k]);
      if (k === 'installationType' && !DM.INSTALL_TYPES.some(function (t) { return t.id === v; })) return;
      if (k === 'symptoms' && Array.isArray(f[k])) v = f[k].map(str).filter(Boolean).join('\n');
      if (v && v !== d[k]) { d[k] = v; changed.push(k); }
    });
    if (changed.length) touch(d);
    return changed;
  };

  DM.addSymptoms = function (d, list) {
    const cur = DM.symptomList(d);
    const have = cur.map(DM.normalize);
    arr(list).map(str).filter(Boolean).forEach(function (s) {
      if (have.indexOf(DM.normalize(s)) === -1) { cur.push(s); have.push(DM.normalize(s)); }
    });
    d.symptoms = cur.join('\n');
    touch(d);
    return cur;
  };

  DM.symptomList = function (d) {
    return String(d.symptoms || '').split(/\n|;/).map(function (s) { return s.trim(); }).filter(Boolean);
  };

  /* ---------- lecture de l'arbre ---------- */
  DM.findHyp = function (d, id) { return d.hypotheses.find(function (h) { return h.id === id; }) || null; };
  DM.findControl = function (d, id) { return d.controls.find(function (c) { return c.id === id; }) || null; };
  DM.findMeasurement = function (d, id) { return (d.measurements || []).find(function (m) { return m.id === id; }) || null; };
  DM.controlsOf = function (d, hid) {
    return d.controls.filter(function (c) { return (c.hypothesisId || null) === (hid || null); });
  };
  DM.childHypotheses = function (d, controlId) {
    return d.hypotheses.filter(function (h) { return h.parentControlId === controlId; });
  };
  DM.rootHypotheses = function (d) { return d.hypotheses.filter(function (h) { return !h.parentControlId; }); };
  DM.hasResult = function (c) { return !!(c && c.doneAt && str(c.obtained)); };
  DM.hypothesisHasResult = function (d, hid) { return DM.controlsOf(d, hid).some(DM.hasResult); };
  DM.measurementsOf = function (d, controlId) {
    return (d.measurements || []).filter(function (m) { return m.controlId === controlId; });
  };

  /** Statut affiché (explicite en V2 ; conservé pour compatibilité). */
  DM.hypothesisState = function (d, h) {
    return DM.HYP_STATUS[h.status] ? h.status : 'possible';
  };

  /** Chemin (ancêtres) d'une hypothèse : [racine, ..., h] */
  DM.hypothesisPath = function (d, hid) {
    const path = [];
    let h = DM.findHyp(d, hid), guard = 0;
    while (h && guard++ < 100) {
      path.unshift(h);
      const c = h.parentControlId ? DM.findControl(d, h.parentControlId) : null;
      h = c && c.hypothesisId ? DM.findHyp(d, c.hypothesisId) : null;
    }
    return path;
  };

  /* ---------- hypothèses ---------- */
  DM.addHypothesis = function (d, f) {
    f = f || {};
    if (!str(f.cause)) throw new Error('La cause possible est obligatoire.');
    if (f.parentControlId) {
      const pc = req(DM.findControl(d, f.parentControlId), 'Contrôle parent introuvable.');
      if (!DM.hasResult(pc)) throw new Error('Une nouvelle hypothèse ne peut découler que d’un contrôle dont le résultat est saisi.');
    }
    const status = f.status === 'suspectee' ? 'suspectee' : 'possible';
    const h = {
      id: DM.uid('hyp'), cause: str(f.cause), reason: str(f.reason),
      parentControlId: f.parentControlId || null, status: status, conclusion: '',
      evidence: [], counterEvidence: [],
      origin: f.origin || 'manuel', createdAt: now(), concludedAt: null
    };
    d.hypotheses.push(h);
    touch(d);
    return h;
  };

  DM.updateHypothesis = function (d, id, f) {
    const h = req(DM.findHyp(d, id), 'Hypothèse introuvable.');
    if (f.cause !== undefined) {
      if (!str(f.cause)) throw new Error('La cause possible est obligatoire.');
      h.cause = str(f.cause);
    }
    if (f.reason !== undefined) h.reason = str(f.reason);
    touch(d);
    return h;
  };

  /** Ajoute une preuve (pour) ou une contre-preuve (contre) à une hypothèse. Les doublons sont ignorés. */
  DM.addEvidence = function (d, hid, e) {
    const h = req(DM.findHyp(d, hid), 'Hypothèse introuvable.');
    e = e || {};
    const text = str(e.text);
    if (!text) throw new Error('La preuve doit être décrite.');
    const list = e.against ? h.counterEvidence : h.evidence;
    if (list.some(function (x) { return DM.normalize(x.text) === DM.normalize(text); })) return null;
    const item = { id: DM.uid('evd'), text: text, source: str(e.source) || 'observation', ref: e.ref || null, at: now() };
    list.push(item);
    touch(d);
    return item;
  };

  /**
   * Change le statut d'une hypothèse.
   * Règles : jamais « confirmée » sans résultat de contrôle ; « écartée » sans résultat
   * exige une justification.
   */
  DM.concludeHypothesis = function (d, id, status, conclusion) {
    const h = req(DM.findHyp(d, id), 'Hypothèse introuvable.');
    if (LEGACY_HYP_STATUS[status]) status = LEGACY_HYP_STATUS[status];
    if (!DM.HYP_STATUS[status]) throw new Error('Statut inconnu.');
    conclusion = str(conclusion);
    const hasRes = DM.hypothesisHasResult(d, id);
    if (status === 'confirmee' && !hasRes) {
      throw new Error('Impossible de confirmer : aucun contrôle de cette hypothèse n’a encore de résultat.');
    }
    if (status === 'ecartee' && !hasRes && !conclusion && !h.counterEvidence.length) {
      throw new Error('Pour écarter une hypothèse sans résultat de contrôle, indiquez une justification.');
    }
    h.status = status;
    if (conclusion || status === 'possible' || status === 'suspectee') h.conclusion = conclusion;
    h.concludedAt = (status === 'confirmee' || status === 'ecartee') ? now() : null;
    revalidateDiag(d);
    touch(d);
    return h;
  };

  /** Supprime une hypothèse, ses contrôles et toute la sous-arborescence. */
  DM.removeHypothesis = function (d, id) {
    const hids = {}, cids = {};
    (function walk(hid) {
      hids[hid] = true;
      d.controls.forEach(function (c) {
        if (c.hypothesisId === hid) {
          cids[c.id] = true;
          d.hypotheses.forEach(function (x) { if (x.parentControlId === c.id && !hids[x.id]) walk(x.id); });
        }
      });
    })(id);
    d.hypotheses = d.hypotheses.filter(function (h) { return !hids[h.id]; });
    d.controls = d.controls.filter(function (c) { return !cids[c.id]; });
    d.measurements.forEach(function (m) { if (cids[m.controlId]) m.controlId = null; });
    revalidateDiag(d);
    touch(d);
    return { hypotheses: Object.keys(hids).length, controls: Object.keys(cids).length };
  };

  /* ---------- contrôles ---------- */
  DM.addControl = function (d, f) {
    f = f || {};
    if (!str(f.description)) throw new Error('Le contrôle à effectuer est obligatoire.');
    if (f.hypothesisId) req(DM.findHyp(d, f.hypothesisId), 'Hypothèse introuvable.');
    const c = {
      id: DM.uid('ctl'), hypothesisId: f.hypothesisId || null,
      type: DM.CONTROL_TYPES[f.type] ? f.type : 'visuel',
      description: str(f.description), expected: str(f.expected),
      why: str(f.why), location: str(f.location),
      risk: f.risk ? Math.max(1, Math.min(4, parseInt(f.risk, 10) || 1)) : null,
      proposedBy: f.proposedBy || 'user',
      obtained: '', measureValue: '', measureUnit: '', verdict: null, conclusion: '',
      safetyAck: null, doneAt: null, createdAt: now()
    };
    d.controls.push(c);
    touch(d);
    return c;
  };

  DM.updateControl = function (d, id, f) {
    const c = req(DM.findControl(d, id), 'Contrôle introuvable.');
    const before = JSON.stringify([c.type, c.description, c.expected]);
    if (f.description !== undefined) {
      if (!str(f.description)) throw new Error('Le contrôle à effectuer est obligatoire.');
      c.description = str(f.description);
    }
    if (f.expected !== undefined) c.expected = str(f.expected);
    if (f.why !== undefined) c.why = str(f.why);
    if (f.location !== undefined) c.location = str(f.location);
    if (f.type !== undefined && DM.CONTROL_TYPES[f.type]) c.type = f.type;
    if (f.hypothesisId !== undefined) {
      const hid = f.hypothesisId || null;
      if (hid) {
        req(DM.findHyp(d, hid), 'Hypothèse introuvable.');
        // interdit de rattacher un contrôle à une hypothèse qui découle de ce même contrôle (cycle)
        if (DM.hypothesisPath(d, hid).some(function (h) { return h.parentControlId === id; })) {
          throw new Error('Rattachement impossible : cette hypothèse découle de ce contrôle.');
        }
      }
      const old = c.hypothesisId;
      c.hypothesisId = hid;
      if (old && old !== hid) revalidateHyp(d, old);
    }
    // si la nature du contrôle change, les consignes de sécurité doivent être revalidées
    if (JSON.stringify([c.type, c.description, c.expected]) !== before) c.safetyAck = null;
    touch(d);
    return c;
  };

  DM.acknowledgeSafety = function (d, id) {
    const c = req(DM.findControl(d, id), 'Contrôle introuvable.');
    c.safetyAck = now();
    touch(d);
    return c;
  };

  /**
   * Enregistre le résultat d'un contrôle.
   * @param {object} [opts] { declaredInChat: true } — résultat rapporté par le technicien dans la conversation :
   *   la validation formelle des consignes n'est pas exigée, mais l'absence de validation est tracée.
   */
  DM.recordResult = function (d, id, r, opts) {
    const c = req(DM.findControl(d, id), 'Contrôle introuvable.');
    r = r || {};
    if (!str(r.obtained)) throw new Error('Le résultat obtenu est obligatoire.');
    const s = DM.getSafety(c, d.installationType);
    if (s.requireAck && !c.safetyAck) {
      if (opts && opts.declaredInChat) c.safetyDeclared = 'chat';
      else throw new Error('Les consignes de sécurité de ce contrôle doivent être validées avant de saisir le résultat.');
    }
    const verdict = r.verdict || 'indetermine';
    if (!DM.VERDICTS[verdict]) throw new Error('Verdict inconnu.');
    c.obtained = str(r.obtained);
    c.measureValue = str(r.measureValue);
    c.measureUnit = c.measureValue ? str(r.measureUnit) : '';
    c.verdict = verdict;
    c.conclusion = str(r.conclusion);
    c.doneAt = now();
    if (c.measureValue) {
      // la mesure saisie avec le résultat rejoint le relevé des mesures (une seule fois par contrôle)
      const existing = DM.measurementsOf(d, c.id).find(function (m) { return m.fromResult; });
      const payload = {
        kind: DM.kindFromUnit(c.measureUnit), label: c.description.slice(0, 80), value: c.measureValue, unit: c.measureUnit,
        location: c.location, controlId: c.id, result: verdict, comment: c.conclusion
      };
      if (existing) Object.assign(existing, payload, { at: now() });
      else { const m = DM.addMeasurement(d, payload); m.fromResult = true; }
    }
    touch(d);
    return c;
  };

  /** Efface le résultat ; les hypothèses qui en découlent doivent d'abord être supprimées. */
  DM.clearResult = function (d, id) {
    const c = req(DM.findControl(d, id), 'Contrôle introuvable.');
    if (DM.childHypotheses(d, id).length) throw new Error('Supprimez d’abord les hypothèses issues de ce résultat.');
    c.obtained = ''; c.measureValue = ''; c.measureUnit = ''; c.verdict = null; c.conclusion = ''; c.doneAt = null;
    d.measurements = d.measurements.filter(function (m) { return !(m.controlId === id && m.fromResult); });
    if (c.hypothesisId) revalidateHyp(d, c.hypothesisId);
    revalidateDiag(d);
    touch(d);
    return c;
  };

  /** Supprime un contrôle et les hypothèses qui découlent de son résultat. */
  DM.removeControl = function (d, id) {
    const c = req(DM.findControl(d, id), 'Contrôle introuvable.');
    const r = { hypotheses: 0, controls: 1 };
    DM.childHypotheses(d, id).forEach(function (h) {
      if (!DM.findHyp(d, h.id)) return;
      const x = DM.removeHypothesis(d, h.id);
      r.hypotheses += x.hypotheses; r.controls += x.controls;
    });
    d.controls = d.controls.filter(function (x) { return x.id !== id; });
    d.measurements.forEach(function (m) { if (m.controlId === id) m.controlId = null; });
    if (c.hypothesisId) revalidateHyp(d, c.hypothesisId);
    revalidateDiag(d);
    touch(d);
    return r;
  };

  /**
   * Contrôles à réaliser, hors pistes écartées, dans l'ordre du plan :
   * pistes suspectées d'abord, puis dans l'ordre des hypothèses (la plus pertinente en premier),
   * puis du moins risqué au plus risqué.
   */
  DM.pendingControls = function (d) {
    const rank = { suspectee: 0, confirmee: 0, possible: 1 };
    function key(c) {
      const h = c.hypothesisId ? DM.findHyp(d, c.hypothesisId) : null;
      return [h ? rank[h.status] : 2, h ? d.hypotheses.indexOf(h) : 9999,
        DM.riskLevel ? DM.riskLevel(c, d.installationType).level : 1];
    }
    return d.controls.filter(function (c) {
      if (DM.hasResult(c)) return false;
      const h = c.hypothesisId ? DM.findHyp(d, c.hypothesisId) : null;
      return !h || h.status !== 'ecartee';
    }).sort(function (a, b) {
      const ka = key(a), kb = key(b);
      return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2] || String(a.createdAt).localeCompare(String(b.createdAt));
    });
  };
  DM.nextControl = function (d) { return DM.pendingControls(d)[0] || null; };

  /** Grandeurs qu'un contrôle mesure, d'après sa description (pour rattacher une valeur au bon contrôle). */
  DM.controlMeasureKinds = function (c) {
    const n = DM.normText((c.description || '') + ' ' + (c.expected || ''));
    const rules = [
      ['courant', ['intensit', 'courant', 'ampere', 'pince']], ['tension', ['tension', 'volt']],
      ['pression', ['pression', 'manifold', 'hp bp', 'npsh']], ['temperature', ['temperat', 'surchauffe', 'sous refroid', 'thermo']],
      ['isolement', ['isolement', 'megohm']], ['resistance', ['resistance', 'ohmmetre', 'enroulement', 'bobine', 'sonde']],
      ['capacite', ['capacit', 'condensateur']], ['frequence', ['frequence']], ['continuite', ['continuite']]
    ];
    return rules.filter(function (r) { return r[1].some(function (k) { return DM.hasKeyword(n, k); }); }).map(function (r) { return r[0]; });
  };

  /* ---------- mesures ---------- */
  DM.addMeasurement = function (d, f) {
    f = f || {};
    const kind = DM.MEASURE_KINDS[f.kind] ? f.kind : DM.kindFromUnit(f.unit);
    const value = str(f.value);
    if (!value) throw new Error('La valeur mesurée est obligatoire.');
    if (f.controlId) req(DM.findControl(d, f.controlId), 'Contrôle introuvable.');
    if (f.result && !DM.VERDICTS[f.result]) throw new Error('Résultat de mesure inconnu.');
    const K = DM.MEASURE_KINDS[kind];
    const m = {
      id: DM.uid('mes'), kind: kind,
      label: str(f.label) || K.label, value: value,
      unit: f.unit != null ? str(f.unit) : (K.units[0] || ''),
      location: str(f.location), controlId: f.controlId || null,
      result: f.result || null, comment: str(f.comment),
      source: f.source || 'technicien', at: f.at || now()
    };
    d.measurements.push(m);
    touch(d);
    return m;
  };
  DM.removeMeasurement = function (d, id) {
    d.measurements = d.measurements.filter(function (m) { return m.id !== id; });
    touch(d);
  };
  DM.formatMeasurement = function (m) {
    const v = m.value + (m.unit ? ' ' + m.unit : '');
    return m.label + ' = ' + v + (m.location ? ' (' + m.location + ')' : '');
  };

  /* ---------- mémoire (faits connus) ---------- */
  /** Enregistre un fait ; une question déjà posée met à jour la réponse au lieu d'en créer une seconde. */
  DM.recordFact = function (d, f) {
    f = f || {};
    const question = str(f.question), answer = str(f.answer);
    if (!question || !answer) throw new Error('Un fait doit avoir une question (ou un sujet) et une réponse.');
    const key = DM.normalize(question).replace(/[^a-z0-9]+/g, ' ').trim();
    let fact = d.facts.find(function (x) { return x.key === key; });
    if (fact) { fact.answer = answer; fact.source = f.source || fact.source; fact.at = now(); }
    else {
      fact = { id: DM.uid('fct'), key: key, question: question, answer: answer, source: f.source || 'technicien', at: now() };
      d.facts.push(fact);
    }
    touch(d);
    return fact;
  };
  DM.findFact = function (d, question) {
    const key = DM.normalize(question).replace(/[^a-z0-9]+/g, ' ').trim();
    return d.facts.find(function (x) { return x.key === key; }) || null;
  };

  /* ---------- conversation ---------- */
  DM.addMessage = function (d, f) {
    f = f || {};
    if (f.role !== 'user' && f.role !== 'assistant') throw new Error('Rôle de message inconnu.');
    const m = {
      id: DM.uid('msg'), role: f.role, text: str(f.text),
      attachments: arr(f.attachments), trace: arr(f.trace),
      ask: f.ask || null, controlId: f.controlId || null,
      engine: f.engine || null, pending: !!f.pending, error: f.error || null,
      at: now()
    };
    d.messages.push(m);
    touch(d);
    return m;
  };
  DM.lastAssistantAsk = function (d) {
    for (let i = d.messages.length - 1; i >= 0; i--) {
      const m = d.messages[i];
      if (m.role === 'assistant') return m.ask || null;
      if (m.role === 'user') return null;
    }
    return null;
  };

  /* ---------- photos ---------- */
  DM.setPhotoAnalysis = function (d, photoId, text) {
    const p = req(d.photos.find(function (x) { return x.id === photoId; }), 'Photo introuvable.');
    p.analysis = { text: str(text), at: now() };
    touch(d);
    return p;
  };

  /* ---------- verdict ---------- */
  DM.confirmedHypotheses = function (d) { return d.hypotheses.filter(function (h) { return h.status === 'confirmee'; }); };
  DM.canClose = function (d) { return DM.confirmedHypotheses(d).length > 0; };

  /**
   * Fixe le verdict du diagnostic.
   * « confirmé » exige une hypothèse confirmée ; « probable » exige une hypothèse suspectée ou confirmée
   * appuyée par au moins une preuve ou un résultat de contrôle.
   */
  DM.setVerdict = function (d, v) {
    v = v || {};
    const status = v.status;
    if (!DM.VERDICT_STATUS[status]) throw new Error('Statut de diagnostic inconnu.');
    if (status === 'confirme' && !DM.canClose(d)) {
      throw new Error('« Diagnostic confirmé » impossible : aucune hypothèse n’est confirmée par un résultat de contrôle.');
    }
    if (status === 'probable') {
      const ok = d.hypotheses.some(function (h) {
        return (h.status === 'suspectee' || h.status === 'confirmee') && (h.evidence.length || DM.hypothesisHasResult(d, h.id));
      });
      if (!ok) throw new Error('« Diagnostic probable » impossible : aucune hypothèse suspectée n’est appuyée par une preuve.');
    }
    d.verdict = { status: status, summary: str(v.summary), missing: arr(v.missing).map(str).filter(Boolean), at: now() };
    touch(d);
    return d.verdict;
  };

  /** Une hypothèse confirmée qui n'a plus aucun résultat de contrôle redevient « possible ». */
  function revalidateHyp(d, hid) {
    const h = DM.findHyp(d, hid);
    if (h && h.status === 'confirmee' && !DM.hypothesisHasResult(d, hid)) {
      h.status = 'possible';
      h.concludedAt = null;
    }
  }
  /** Un diagnostic clôturé ou confirmé sans hypothèse confirmée est rouvert / rétrogradé. */
  function revalidateDiag(d) {
    if (!DM.canClose(d)) {
      if (d.status === 'cloture') { d.status = 'en_cours'; d.closedAt = null; }
      if (d.verdict && d.verdict.status === 'confirme') { d.verdict.status = 'non_confirme'; d.verdict.at = now(); }
    }
  }

  /* ---------- clôture ---------- */
  DM.saveConclusion = function (d, f) {
    ['finalDiagnosis', 'repair', 'recommendations', 'finalResult'].forEach(function (k) { if (f[k] !== undefined) d[k] = str(f[k]); });
    if (Array.isArray(f.parts)) DM.setParts(d, f.parts);
    touch(d);
    return d;
  };

  DM.setParts = function (d, parts) {
    d.parts = arr(parts).map(function (p) {
      return { designation: str(p.designation), reference: str(p.reference), quantity: str(p.quantity) || '1' };
    }).filter(function (p) { return p.designation || p.reference; });
    touch(d);
    return d.parts;
  };

  DM.closeDiagnostic = function (d, f) {
    if (!DM.canClose(d)) throw new Error('Clôture impossible : aucune hypothèse n’est confirmée par un résultat de contrôle.');
    DM.saveConclusion(d, f || {});
    if (!d.finalDiagnosis) throw new Error('Rédigez le diagnostic final avant de clôturer.');
    d.status = 'cloture';
    d.closedAt = now();
    if (d.verdict.status !== 'confirme') d.verdict = { status: 'confirme', summary: d.verdict.summary || d.finalDiagnosis, missing: [], at: now() };
    return d;
  };

  DM.reopenDiagnostic = function (d) {
    d.status = 'en_cours'; d.closedAt = null; touch(d); return d;
  };

  /** Étape courante de la démarche (index dans DM.STEPS). */
  DM.currentStep = function (d) {
    if (d.status === 'cloture' || DM.canClose(d)) return 4;
    if (d.controls.some(DM.hasResult)) return 3;
    if (d.controls.length) return 2;
    if (d.hypotheses.length) return 1;
    return 0;
  };

  DM.diagStats = function (d) {
    return {
      hypotheses: d.hypotheses.length,
      controls: d.controls.length,
      done: d.controls.filter(DM.hasResult).length,
      confirmed: DM.confirmedHypotheses(d).length,
      photos: (d.photos || []).length,
      measurements: (d.measurements || []).length,
      messages: (d.messages || []).length
    };
  };

  /**
   * Duplique un diagnostic (tous les identifiants internes sont régénérés). La conversation et le
   * verdict ne sont pas repris : la copie repart d'une nouvelle recherche sur le même matériel.
   * @param {object} [opts] { photoMap: {ancienId: nouvelId}, id } — sans photoMap, les photos ne sont pas copiées.
   */
  DM.duplicateDiagnostic = function (d, opts) {
    const c = DM.normalizeDiag(DM.clone(d));
    const hmap = {}, cmap = {}, t = now();
    c.id = (opts && opts.id) || DM.uid('diag');
    c.name = d.name + ' (copie)';
    c.status = 'en_cours'; c.closedAt = null; c.createdAt = t; c.updatedAt = t;
    c.messages = [];
    c.verdict = { status: 'non_confirme', summary: '', missing: [], at: null };
    c.hypotheses.forEach(function (h) { const n = DM.uid('hyp'); hmap[h.id] = n; h.id = n; });
    c.controls.forEach(function (x) {
      const n = DM.uid('ctl'); cmap[x.id] = n; x.id = n;
      x.hypothesisId = x.hypothesisId ? (hmap[x.hypothesisId] || null) : null;
    });
    c.hypotheses.forEach(function (h) { if (h.parentControlId) h.parentControlId = cmap[h.parentControlId] || null; });
    c.measurements.forEach(function (m) { m.id = DM.uid('mes'); m.controlId = m.controlId ? (cmap[m.controlId] || null) : null; });
    c.facts.forEach(function (f) { f.id = DM.uid('fct'); });
    const pm = opts && opts.photoMap;
    c.photos = pm ? (c.photos || []).map(function (p) { return Object.assign({}, p, { id: pm[p.id] }); }).filter(function (p) { return p.id; }) : [];
    return c;
  };
})(window.DM);
