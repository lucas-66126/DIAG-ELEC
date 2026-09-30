/* DIAG-MAINT — modèle métier du diagnostic (sans DOM).
 *
 * Arbre de diagnostic :
 *   SYMPTÔMES (diagnostic)
 *     └─ HYPOTHÈSE (parentControlId = null  → hypothèse racine)
 *          └─ CONTRÔLE (hypothesisId)
 *               └─ RÉSULTAT (obtained, mesure, verdict)
 *                    └─ nouvelle HYPOTHÈSE (parentControlId = id du contrôle) ...
 *   → DIAGNOSTIC FINAL (uniquement si une hypothèse est confirmée par un résultat de contrôle)
 *
 * Les contrôles « généraux » ont hypothesisId = null.
 */
(function (DM) {
  'use strict';

  const now = function () { return new Date().toISOString(); };
  function touch(d) { d.updatedAt = now(); }
  function req(x, msg) { if (!x) throw new Error(msg); return x; }
  function str(v) { return v == null ? '' : String(v).trim(); }

  DM.DIAG_STATUS = {
    en_cours: { label: 'En cours', cls: 'progress' },
    cloture: { label: 'Clôturé', cls: 'ok' }
  };
  DM.HYP_STATUS = {
    a_verifier: { label: 'À vérifier', cls: 'todo' },
    en_cours: { label: 'En contrôle', cls: 'progress' },
    confirmee: { label: 'Confirmée', cls: 'ok' },
    ecartee: { label: 'Écartée', cls: 'ko' }
  };
  DM.VERDICTS = {
    non_conforme: { label: 'Non conforme', cls: 'ko' },
    conforme: { label: 'Conforme', cls: 'ok' },
    indetermine: { label: 'Indéterminé', cls: 'todo' }
  };
  DM.STEPS = ['Symptômes', 'Hypothèses', 'Contrôles', 'Résultats', 'Diagnostic'];

  const INFO_FIELDS = ['name', 'installationType', 'brand', 'model', 'reference', 'location', 'description', 'symptoms', 'date'];

  DM.validateInfo = function (f) {
    const errors = [];
    if (!str(f.name)) errors.push('Le nom du diagnostic est obligatoire.');
    if (!f.installationType || !DM.INSTALL_TYPES.some(function (t) { return t.id === f.installationType; })) errors.push('Choisissez un type d’installation.');
    if (!str(f.description)) errors.push('La description de la panne est obligatoire.');
    return errors;
  };

  DM.createDiagnostic = function (f) {
    f = f || {};
    const errors = DM.validateInfo(f);
    if (errors.length) throw new Error(errors[0]);
    const t = now();
    const d = {
      id: f.id || DM.uid('diag'), schema: 1,
      name: '', installationType: 'autre', brand: '', model: '', reference: '', location: '',
      description: '', symptoms: '', date: DM.todayISO(),
      status: 'en_cours', photos: Array.isArray(f.photos) ? f.photos : [],
      hypotheses: [], controls: [],
      finalDiagnosis: '', repair: '', recommendations: '',
      createdAt: t, updatedAt: t, closedAt: null
    };
    INFO_FIELDS.forEach(function (k) { if (f[k] != null && f[k] !== '') d[k] = str(f[k]); });
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

  DM.symptomList = function (d) {
    return String(d.symptoms || '').split(/\n|;/).map(function (s) { return s.trim(); }).filter(Boolean);
  };

  /* ---------- lecture de l'arbre ---------- */
  DM.findHyp = function (d, id) { return d.hypotheses.find(function (h) { return h.id === id; }) || null; };
  DM.findControl = function (d, id) { return d.controls.find(function (c) { return c.id === id; }) || null; };
  DM.controlsOf = function (d, hid) {
    return d.controls.filter(function (c) { return (c.hypothesisId || null) === (hid || null); });
  };
  DM.childHypotheses = function (d, controlId) {
    return d.hypotheses.filter(function (h) { return h.parentControlId === controlId; });
  };
  DM.rootHypotheses = function (d) { return d.hypotheses.filter(function (h) { return !h.parentControlId; }); };
  DM.hasResult = function (c) { return !!(c && c.doneAt && str(c.obtained)); };
  DM.hypothesisHasResult = function (d, hid) { return DM.controlsOf(d, hid).some(DM.hasResult); };

  /** État affiché : une hypothèse n'est « confirmée »/« écartée » que par décision explicite. */
  DM.hypothesisState = function (d, h) {
    if (h.status === 'confirmee' || h.status === 'ecartee') return h.status;
    return DM.hypothesisHasResult(d, h.id) ? 'en_cours' : 'a_verifier';
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
    const h = {
      id: DM.uid('hyp'), cause: str(f.cause), reason: str(f.reason),
      parentControlId: f.parentControlId || null, status: 'a_verifier', conclusion: '',
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

  /**
   * Conclut une hypothèse.
   * Règle : on ne confirme JAMAIS une hypothèse sans résultat de contrôle.
   * Écarter sans résultat exige une justification écrite.
   */
  DM.concludeHypothesis = function (d, id, status, conclusion) {
    const h = req(DM.findHyp(d, id), 'Hypothèse introuvable.');
    if (!DM.HYP_STATUS[status]) throw new Error('Statut inconnu.');
    conclusion = str(conclusion);
    const hasRes = DM.hypothesisHasResult(d, id);
    if (status === 'confirmee' && !hasRes) {
      throw new Error('Impossible de confirmer : aucun contrôle de cette hypothèse n’a encore de résultat.');
    }
    if (status === 'ecartee' && !hasRes && !conclusion) {
      throw new Error('Pour écarter une hypothèse sans résultat de contrôle, indiquez une justification.');
    }
    if (status === 'a_verifier' || status === 'en_cours') status = hasRes ? 'en_cours' : 'a_verifier';
    h.status = status;
    h.conclusion = conclusion;
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

  DM.recordResult = function (d, id, r) {
    const c = req(DM.findControl(d, id), 'Contrôle introuvable.');
    r = r || {};
    if (!str(r.obtained)) throw new Error('Le résultat obtenu est obligatoire.');
    const s = DM.getSafety(c, d.installationType);
    if (s.requireAck && !c.safetyAck) throw new Error('Les consignes de sécurité de ce contrôle doivent être validées avant de saisir le résultat.');
    const verdict = r.verdict || 'indetermine';
    if (!DM.VERDICTS[verdict]) throw new Error('Verdict inconnu.');
    c.obtained = str(r.obtained);
    c.measureValue = str(r.measureValue);
    c.measureUnit = c.measureValue ? str(r.measureUnit) : '';
    c.verdict = verdict;
    c.conclusion = str(r.conclusion);
    c.doneAt = now();
    touch(d);
    return c;
  };

  /** Efface le résultat ; les hypothèses qui en découlent sont conservées mais l'état est revalidé. */
  DM.clearResult = function (d, id) {
    const c = req(DM.findControl(d, id), 'Contrôle introuvable.');
    if (DM.childHypotheses(d, id).length) throw new Error('Supprimez d’abord les hypothèses issues de ce résultat.');
    c.obtained = ''; c.measureValue = ''; c.measureUnit = ''; c.verdict = null; c.conclusion = ''; c.doneAt = null;
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
    if (c.hypothesisId) revalidateHyp(d, c.hypothesisId);
    revalidateDiag(d);
    touch(d);
    return r;
  };

  /** Une hypothèse confirmée qui n'a plus aucun résultat de contrôle redevient « à vérifier ». */
  function revalidateHyp(d, hid) {
    const h = DM.findHyp(d, hid);
    if (h && h.status === 'confirmee' && !DM.hypothesisHasResult(d, hid)) {
      h.status = 'a_verifier';
      h.concludedAt = null;
    }
  }
  /** Un diagnostic clôturé sans hypothèse confirmée est rouvert. */
  function revalidateDiag(d) {
    if (d.status === 'cloture' && !DM.canClose(d)) { d.status = 'en_cours'; d.closedAt = null; }
  }

  /* ---------- diagnostic final ---------- */
  DM.confirmedHypotheses = function (d) { return d.hypotheses.filter(function (h) { return h.status === 'confirmee'; }); };
  DM.canClose = function (d) { return DM.confirmedHypotheses(d).length > 0; };

  DM.saveConclusion = function (d, f) {
    ['finalDiagnosis', 'repair', 'recommendations'].forEach(function (k) { if (f[k] !== undefined) d[k] = str(f[k]); });
    touch(d);
    return d;
  };

  DM.closeDiagnostic = function (d, f) {
    if (!DM.canClose(d)) throw new Error('Clôture impossible : aucune hypothèse n’est confirmée par un résultat de contrôle.');
    DM.saveConclusion(d, f || {});
    if (!d.finalDiagnosis) throw new Error('Rédigez le diagnostic final avant de clôturer.');
    d.status = 'cloture';
    d.closedAt = now();
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
      photos: (d.photos || []).length
    };
  };

  /**
   * Duplique un diagnostic (tous les identifiants internes sont régénérés).
   * @param {object} [opts] { photoMap: {ancienId: nouvelId} } — sans photoMap, les photos ne sont pas copiées.
   */
  DM.duplicateDiagnostic = function (d, opts) {
    const c = DM.clone(d);
    const hmap = {}, cmap = {}, t = now();
    c.id = DM.uid('diag');
    c.name = d.name + ' (copie)';
    c.status = 'en_cours'; c.closedAt = null; c.createdAt = t; c.updatedAt = t;
    c.hypotheses.forEach(function (h) { const n = DM.uid('hyp'); hmap[h.id] = n; h.id = n; });
    c.controls.forEach(function (x) {
      const n = DM.uid('ctl'); cmap[x.id] = n; x.id = n;
      x.hypothesisId = x.hypothesisId ? (hmap[x.hypothesisId] || null) : null;
    });
    c.hypotheses.forEach(function (h) { if (h.parentControlId) h.parentControlId = cmap[h.parentControlId] || null; });
    const pm = opts && opts.photoMap;
    c.photos = pm ? (c.photos || []).map(function (p) { return Object.assign({}, p, { id: pm[p.id] }); }).filter(function (p) { return p.id; }) : [];
    return c;
  };
})(window.DM);
