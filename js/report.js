/* DIAG-MAINT — construction du compte-rendu (sans DOM) */
(function (DM) {
  'use strict';

  function dash(v) { return v ? String(v) : '—'; }

  DM.reportNumber = function (d) { return 'DM-' + String(d.id).slice(-6).toUpperCase(); };

  DM.buildReport = function (d, settings) {
    settings = settings || {};
    const done = d.controls.filter(DM.hasResult).slice().sort(function (a, b) { return String(a.doneAt).localeCompare(String(b.doneAt)); });
    const hypLabel = function (c) {
      const h = c.hypothesisId ? DM.findHyp(d, c.hypothesisId) : null;
      return h ? h.cause : 'Contrôle général';
    };
    const measure = function (c) { return c.measureValue ? (c.measureValue + (c.measureUnit ? ' ' + c.measureUnit : '')) : ''; };
    return {
      number: DM.reportNumber(d),
      title: d.name,
      date: d.date,
      generatedAt: new Date().toISOString(),
      closedAt: d.closedAt,
      technician: settings.technician || '',
      company: settings.company || '',
      status: (DM.DIAG_STATUS[d.status] || DM.DIAG_STATUS.en_cours).label,
      equipment: [
        ['Type d’installation', DM.installType(d.installationType).label],
        ['Marque', dash(d.brand)],
        ['Modèle', dash(d.model)],
        ['Référence', dash(d.reference)],
        ['Localisation', dash(d.location)]
      ],
      description: d.description,
      symptoms: DM.symptomList(d),
      controls: done.map(function (c) {
        return {
          hypothesis: hypLabel(c),
          type: DM.CONTROL_TYPES[c.type].label,
          description: c.description,
          expected: c.expected,
          obtained: c.obtained,
          measure: measure(c),
          verdict: (DM.VERDICTS[c.verdict] || DM.VERDICTS.indetermine).label,
          verdictCls: (DM.VERDICTS[c.verdict] || DM.VERDICTS.indetermine).cls,
          conclusion: c.conclusion,
          doneAt: c.doneAt
        };
      }),
      pendingControls: d.controls.length - done.length,
      measures: done.filter(function (c) { return c.measureValue; }).map(function (c) {
        return { label: c.description, value: measure(c), expected: c.expected };
      }),
      hypotheses: d.hypotheses.map(function (h) {
        const st = DM.HYP_STATUS[DM.hypothesisState(d, h)];
        return { cause: h.cause, state: st.label, stateCls: st.cls, conclusion: h.conclusion };
      }),
      confirmed: DM.confirmedHypotheses(d).map(function (h) { return h.cause; }),
      isConfirmed: DM.canClose(d),
      diagnosis: d.finalDiagnosis,
      repair: d.repair,
      recommendations: d.recommendations,
      photoCount: (d.photos || []).length
    };
  };

  DM.reportToText = function (r) {
    const L = [];
    const sep = '----------------------------------------';
    L.push('COMPTE-RENDU DE DIAGNOSTIC — DIAG-MAINT');
    L.push('N° ' + r.number + ' — ' + r.title);
    L.push('Date : ' + DM.fmtDate(r.date) + (r.technician ? ' — Technicien : ' + r.technician : '') + (r.company ? ' (' + r.company + ')' : ''));
    L.push('Statut : ' + r.status);
    L.push(sep, 'MATÉRIEL');
    r.equipment.forEach(function (e) { L.push('- ' + e[0] + ' : ' + e[1]); });
    L.push(sep, 'PANNE CONSTATÉE', r.description || '—');
    L.push(sep, 'SYMPTÔMES');
    if (r.symptoms.length) r.symptoms.forEach(function (s) { L.push('- ' + s); }); else L.push('—');
    L.push(sep, 'CONTRÔLES RÉALISÉS');
    if (!r.controls.length) L.push('Aucun contrôle réalisé.');
    r.controls.forEach(function (c, i) {
      L.push((i + 1) + '. [' + c.type + '] ' + c.description);
      L.push('   Hypothèse : ' + c.hypothesis);
      if (c.expected) L.push('   Attendu : ' + c.expected);
      L.push('   Obtenu : ' + c.obtained + (c.measure ? ' (mesure : ' + c.measure + ')' : ''));
      L.push('   Verdict : ' + c.verdict + (c.conclusion ? ' — ' + c.conclusion : ''));
    });
    if (r.pendingControls) L.push('(' + DM.plural(r.pendingControls, 'contrôle prévu non réalisé', 'contrôles prévus non réalisés') + ')');
    L.push(sep, 'MESURES');
    if (!r.measures.length) L.push('Aucune mesure relevée.');
    r.measures.forEach(function (m) { L.push('- ' + m.label + ' : ' + m.value + (m.expected ? ' (attendu : ' + m.expected + ')' : '')); });
    L.push(sep, 'HYPOTHÈSES ÉTUDIÉES');
    if (!r.hypotheses.length) L.push('—');
    r.hypotheses.forEach(function (h) { L.push('- ' + h.cause + ' : ' + h.state + (h.conclusion ? ' — ' + h.conclusion : '')); });
    L.push(sep, 'DIAGNOSTIC');
    if (!r.isConfirmed) L.push('⚠ Aucune hypothèse confirmée par un contrôle : diagnostic non établi.');
    if (r.confirmed.length) L.push('Cause(s) confirmée(s) : ' + r.confirmed.join(' ; '));
    L.push(r.diagnosis || '—');
    L.push(sep, 'RÉPARATION EFFECTUÉE', r.repair || '—');
    L.push(sep, 'RECOMMANDATIONS', r.recommendations || '—');
    L.push(sep, 'Généré le ' + DM.fmtDateTime(r.generatedAt));
    return L.join('\n');
  };
})(window.DM);
