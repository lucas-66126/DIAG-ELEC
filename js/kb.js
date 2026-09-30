/* DIAG-MAINT — base de connaissances : diagnostics terminés → fiches de connaissance + recherche.
 * Sans DOM : utilisé par le navigateur (recherche locale, moteur hors ligne) et par le serveur. */
(function (DM) {
  'use strict';

  const STOP = ['avec', 'sans', 'dans', 'pour', 'plus', 'tres', 'mais', 'elle', 'elles', 'nous', 'vous', 'sont', 'fait', 'faire',
    'etre', 'avoir', 'apres', 'avant', 'depuis', 'quand', 'comme', 'cette', 'celui', 'leur', 'tout', 'tous', 'toute', 'toutes',
    'aussi', 'encore', 'alors', 'donc', 'ainsi', 'entre', 'sous', 'chez', 'lors', 'unite', 'moins', 'matin', 'soir'];

  function tokens(text) {
    return DM.normText(text).trim().split(' ').filter(function (w) {
      return w.length >= 4 && STOP.indexOf(w) === -1 && !/^\d+$/.test(w);
    }).map(function (w) { return w.length > 6 ? w.slice(0, 6) : w; }); // racine grossière (déclenche/déclenchement)
  }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
  function normRef(s) { return DM.normalize(s).replace(/[^a-z0-9]/g, ''); }

  /** Extrait les codes défaut cités (« code E6 », « défaut P8 », « affiche U4 »…). */
  DM.extractErrorCodes = function (text) {
    const out = [];
    const re = /(?:code|d[ée]faut|erreur|affiche|clignot\w*|alarme)\s*(?:d['’]\s*erreur|d[ée]faut|n°|no|:)?\s*["«]?\s*([A-Za-z]{0,3}\s?-?\d{1,4}[A-Za-z]?)\b/gi;
    let m;
    while ((m = re.exec(String(text || '')))) {
      const code = m[1].replace(/\s+/g, '').toUpperCase();
      if (/[0-9]/.test(code) && out.indexOf(code) === -1) out.push(code);
    }
    return out;
  };

  DM.kb = {};

  /** Transforme un diagnostic en fiche de connaissance. */
  DM.kb.fromDiagnostic = function (d) {
    const confirmed = DM.confirmedHypotheses(d).map(function (h) { return h.cause; });
    const codes = uniq(DM.extractErrorCodes([d.description, d.symptoms, d.name].join(' '))
      .concat((d.measurements || []).filter(function (m) { return m.kind === 'code'; }).map(function (m) { return String(m.value).toUpperCase().replace(/\s+/g, ''); }))
      .concat((d.facts || []).reduce(function (a, f) { return a.concat(DM.extractErrorCodes(f.question + ' ' + f.answer)); }, [])));
    return {
      id: 'kb_' + d.id,
      diagId: d.id,
      title: d.name,
      date: d.date,
      installationType: d.installationType,
      brand: d.brand, model: d.model, reference: d.reference,
      description: d.description,
      symptoms: DM.symptomList(d),
      errorCodes: codes,
      measurements: (d.measurements || []).slice(0, 30).map(function (m) {
        return { label: m.label, value: m.value, unit: m.unit, location: m.location, result: m.result };
      }),
      cause: confirmed.join(' ; ') || '',
      diagnosis: d.finalDiagnosis || (d.verdict && d.verdict.summary) || '',
      verdict: (d.verdict && d.verdict.status) || 'non_confirme',
      repair: d.repair || '',
      parts: (d.parts || []).map(function (p) { return p.designation + (p.reference ? ' (' + p.reference + ')' : ''); }),
      closed: d.status === 'cloture',
      updatedAt: d.updatedAt
    };
  };

  /** Fiches issues des diagnostics clôturés (ou dont le verdict est au moins probable). */
  DM.kb.fromDiagnostics = function (list) {
    return (list || []).filter(function (d) {
      return d.status === 'cloture' || (d.verdict && d.verdict.status !== 'non_confirme');
    }).map(DM.kb.fromDiagnostic);
  };

  DM.KB_MODES = {
    similaire: 'Panne similaire',
    reference: 'Même référence',
    code: 'Même code défaut',
    symptome: 'Même symptôme'
  };

  /**
   * Recherche dans les fiches.
   * @param {object[]} entries fiches (DM.kb.fromDiagnostic)
   * @param {object} q { mode, text, reference, code, symptom, installationType, brand, excludeDiagId, limit }
   * @returns {{entry, score, why: string[]}[]}
   */
  DM.kb.search = function (entries, q) {
    q = q || {};
    const mode = DM.KB_MODES[q.mode] ? q.mode : 'similaire';
    const ref = normRef(q.reference || (mode === 'reference' ? q.text : ''));
    const codes = uniq([].concat(q.code ? [String(q.code).toUpperCase().replace(/\s+/g, '')] : [])
      .concat(mode === 'code' && q.text && !q.code ? [String(q.text).toUpperCase().replace(/\s+/g, '')] : [])
      .concat(DM.extractErrorCodes(q.text || '')));
    const symTokens = uniq(tokens(q.symptom || (mode === 'symptome' || mode === 'similaire' ? q.text : '') || ''));
    const results = [];

    (entries || []).forEach(function (e) {
      if (q.excludeDiagId && e.diagId === q.excludeDiagId) return;
      let score = 0;
      const why = [];
      if (ref) {
        const refs = [e.reference, e.model].map(normRef).filter(Boolean);
        if (refs.some(function (r) { return r === ref; })) { score += 5; why.push('même référence'); }
        else if (ref.length >= 4 && refs.some(function (r) { return r.indexOf(ref) === 0 || ref.indexOf(r) === 0; })) { score += 3; why.push('référence proche'); }
      }
      if (codes.length) {
        const common = codes.filter(function (c) { return e.errorCodes.indexOf(c) !== -1; });
        if (common.length) { score += 5; why.push('même code défaut (' + common.join(', ') + ')'); }
      }
      if (symTokens.length) {
        const et = uniq(tokens(e.symptoms.join(' ') + ' ' + e.description + ' ' + e.title));
        const common = symTokens.filter(function (t) { return et.indexOf(t) !== -1; });
        if (common.length) { score += common.length; why.push('symptômes communs (' + common.length + ')'); }
      }
      if (mode === 'similaire') {
        if (q.installationType && e.installationType === q.installationType) { score += 1; why.push('même type d’installation'); }
        if (q.brand && DM.normalize(e.brand) === DM.normalize(q.brand)) { score += 1; why.push('même marque'); }
      }
      const required = { reference: why.some(function (w) { return /référence/.test(w); }), code: why.some(function (w) { return /code/.test(w); }),
        symptome: why.some(function (w) { return /symptômes/.test(w); }), similaire: score >= 2 };
      if (!required[mode] || score <= 0) return;
      if (e.cause) score += 0.5; // une cause confirmée rend la fiche plus utile
      results.push({ entry: e, score: score, why: why });
    });
    return results.sort(function (a, b) { return b.score - a.score || String(b.entry.updatedAt).localeCompare(String(a.entry.updatedAt)); })
      .slice(0, q.limit || 10);
  };

  /** Résumé court d'une fiche (pour l'agent et l'interface). */
  DM.kb.summary = function (e) {
    return [
      e.title + ' (' + DM.fmtDate(e.date) + ')',
      [e.brand, e.model, e.reference].filter(Boolean).join(' ') || null,
      e.symptoms.length ? 'Symptômes : ' + e.symptoms.join(' ; ') : null,
      e.errorCodes.length ? 'Codes : ' + e.errorCodes.join(', ') : null,
      e.cause ? 'Cause confirmée : ' + e.cause : (e.diagnosis ? 'Diagnostic : ' + e.diagnosis : null),
      e.repair ? 'Réparation : ' + e.repair : null
    ].filter(Boolean).join(' — ');
  };
})(window.DM);
