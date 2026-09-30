/* DIAG-MAINT — construction du compte-rendu (sans DOM, navigateur + Node) */
(function (DM) {
  'use strict';

  function dash(v) { return v ? String(v) : '—'; }

  DM.reportNumber = function (d) { return 'DM-' + String(d.id).slice(-6).toUpperCase(); };

  DM.buildReport = function (d, settings) {
    settings = settings || {};
    d = DM.normalizeDiag ? DM.normalizeDiag(d) : d;
    const done = d.controls.filter(DM.hasResult).slice().sort(function (a, b) { return String(a.doneAt).localeCompare(String(b.doneAt)); });
    const hypLabel = function (c) {
      const h = c.hypothesisId ? DM.findHyp(d, c.hypothesisId) : null;
      return h ? h.cause : 'Contrôle général';
    };
    const fmtM = function (m) { return m.value + (m.unit ? ' ' + m.unit : ''); };
    const verdict = DM.VERDICT_STATUS[(d.verdict && d.verdict.status) || 'non_confirme'];
    return {
      number: DM.reportNumber(d),
      title: d.name,
      date: d.date,
      generatedAt: new Date().toISOString(),
      closedAt: d.closedAt,
      technician: settings.technician || '',
      company: settings.company || '',
      client: d.client || '',
      site: d.site || '',
      status: (DM.DIAG_STATUS[d.status] || DM.DIAG_STATUS.en_cours).label,
      verdict: { label: verdict.label, cls: verdict.cls, summary: (d.verdict && d.verdict.summary) || '', missing: (d.verdict && d.verdict.missing) || [] },
      equipment: [
        ['Type d’installation', DM.installType(d.installationType).label],
        ['Marque', dash(d.brand)],
        ['Modèle', dash(d.model)],
        ['Référence', dash(d.reference)],
        ['N° de série', dash(d.serial)],
        ['Localisation', dash(d.location)]
      ],
      description: d.description,
      symptoms: DM.symptomList(d),
      facts: (d.facts || []).map(function (f) { return { question: f.question, answer: f.answer }; }),
      controls: done.map(function (c) {
        const ms = DM.measurementsOf(d, c.id);
        const r = DM.riskLevel ? DM.riskLevel(c, d.installationType) : { level: 1 };
        return {
          hypothesis: hypLabel(c),
          type: DM.CONTROL_TYPES[c.type].label,
          risk: r.level,
          description: c.description,
          expected: c.expected,
          obtained: c.obtained,
          measure: ms.length ? ms.map(fmtM).join(', ') : (c.measureValue ? c.measureValue + (c.measureUnit ? ' ' + c.measureUnit : '') : ''),
          verdict: (DM.VERDICTS[c.verdict] || DM.VERDICTS.indetermine).label,
          verdictCls: (DM.VERDICTS[c.verdict] || DM.VERDICTS.indetermine).cls,
          conclusion: c.conclusion,
          safetyDeclared: c.safetyDeclared === 'chat' && !c.safetyAck,
          photos: (c.photos || []).map(function (p) { return p.id; }),
          doneAt: c.doneAt
        };
      }),
      pendingControls: d.controls.length - done.length,
      measures: (d.measurements || []).slice().sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); }).map(function (m) {
        const c = m.controlId ? DM.findControl(d, m.controlId) : null;
        return {
          label: m.label, value: fmtM(m), location: m.location, at: m.at,
          control: c ? c.description : '', expected: c ? c.expected : '',
          result: m.result ? DM.VERDICTS[m.result].label : '', resultCls: m.result ? DM.VERDICTS[m.result].cls : '',
          comment: m.comment
        };
      }),
      hypotheses: d.hypotheses.map(function (h) {
        const st = DM.HYP_STATUS[DM.hypothesisState(d, h)];
        return { cause: h.cause, state: st.label, stateCls: st.cls, conclusion: h.conclusion,
          evidence: h.evidence.map(function (e) { return e.text; }), counterEvidence: h.counterEvidence.map(function (e) { return e.text; }) };
      }),
      confirmed: DM.confirmedHypotheses(d).map(function (h) { return h.cause; }),
      isConfirmed: DM.canClose(d),
      diagnosis: d.finalDiagnosis || (d.verdict && d.verdict.summary) || '',
      repair: d.repair,
      parts: (d.parts || []).map(function (p) { return { designation: p.designation, reference: p.reference, quantity: p.quantity }; }),
      recommendations: d.recommendations,
      finalResult: d.finalResult ? (DM.FINAL_RESULTS[d.finalResult] || d.finalResult) : '',
      photos: (d.photos || []).map(function (p) { return { id: p.id, kind: DM.PHOTO_KINDS[p.kind] || 'Photo', caption: p.caption || '', analysis: p.analysis ? p.analysis.text : '' }; }),
      photoCount: (d.photos || []).length,
      documents: (d.documents || []).map(function (x) { return x.title; })
    };
  };

  DM.reportToText = function (r) {
    const L = [];
    const sep = '----------------------------------------';
    L.push('COMPTE-RENDU DE DIAGNOSTIC — DIAG-MAINT');
    L.push('N° ' + r.number + ' — ' + r.title);
    L.push('Date : ' + DM.fmtDate(r.date) + (r.technician ? ' — Technicien : ' + r.technician : '') + (r.company ? ' (' + r.company + ')' : ''));
    if (r.client || r.site) L.push('Client / site : ' + [r.client, r.site].filter(Boolean).join(' — '));
    L.push('Statut : ' + r.status + ' — ' + r.verdict.label);
    L.push(sep, 'MATÉRIEL');
    r.equipment.forEach(function (e) { L.push('- ' + e[0] + ' : ' + e[1]); });
    L.push(sep, 'PANNE CONSTATÉE', r.description || '—');
    L.push(sep, 'SYMPTÔMES');
    if (r.symptoms.length) r.symptoms.forEach(function (s) { L.push('- ' + s); }); else L.push('—');
    if (r.facts.length) {
      L.push(sep, 'INFORMATIONS RECUEILLIES');
      r.facts.forEach(function (f) { L.push('- ' + f.question + ' → ' + f.answer); });
    }
    L.push(sep, 'CONTRÔLES RÉALISÉS');
    if (!r.controls.length) L.push('Aucun contrôle réalisé.');
    r.controls.forEach(function (c, i) {
      L.push((i + 1) + '. [' + c.type + ', risque N' + c.risk + '] ' + c.description);
      L.push('   Hypothèse : ' + c.hypothesis);
      if (c.expected) L.push('   Attendu : ' + c.expected);
      L.push('   Obtenu : ' + c.obtained + (c.measure ? ' (mesure : ' + c.measure + ')' : ''));
      L.push('   Verdict : ' + c.verdict + (c.conclusion ? ' — ' + c.conclusion : ''));
      if (c.safetyDeclared) L.push('   (consignes de sécurité non validées formellement dans l’application)');
    });
    if (r.pendingControls) L.push('(' + DM.plural(r.pendingControls, 'contrôle prévu non réalisé', 'contrôles prévus non réalisés') + ')');
    L.push(sep, 'MESURES');
    if (!r.measures.length) L.push('Aucune mesure relevée.');
    r.measures.forEach(function (m) {
      L.push('- ' + DM.fmtDateTime(m.at) + ' — ' + m.label + ' = ' + m.value + (m.location ? ' — ' + m.location : '') +
        (m.control ? ' — contrôle : ' + m.control : '') + (m.result ? ' — ' + m.result : ''));
    });
    L.push(sep, 'HYPOTHÈSES ÉTUDIÉES');
    if (!r.hypotheses.length) L.push('—');
    r.hypotheses.forEach(function (h) {
      L.push('- ' + h.cause + ' : ' + h.state + (h.conclusion ? ' — ' + h.conclusion : ''));
      h.evidence.forEach(function (e) { L.push('    + ' + e); });
      h.counterEvidence.forEach(function (e) { L.push('    − ' + e); });
    });
    L.push(sep, 'DIAGNOSTIC — ' + r.verdict.label.toUpperCase());
    if (!r.isConfirmed) L.push('⚠ Aucune hypothèse confirmée par un contrôle : diagnostic non établi.');
    if (r.confirmed.length) L.push('Cause(s) confirmée(s) : ' + r.confirmed.join(' ; '));
    L.push(r.diagnosis || '—');
    if (r.verdict.missing.length) L.push('Éléments manquants : ' + r.verdict.missing.join(' ; '));
    L.push(sep, 'RÉPARATION EFFECTUÉE', r.repair || '—');
    L.push(sep, 'PIÈCES UTILISÉES');
    if (!r.parts.length) L.push('—');
    r.parts.forEach(function (p) { L.push('- ' + p.quantity + ' × ' + p.designation + (p.reference ? ' (réf. ' + p.reference + ')' : '')); });
    L.push(sep, 'RECOMMANDATIONS', r.recommendations || '—');
    L.push(sep, 'RÉSULTAT FINAL', r.finalResult || '—');
    if (r.photos.length) {
      L.push(sep, 'PHOTOS (' + r.photos.length + ')');
      r.photos.forEach(function (p) { L.push('- ' + p.kind + (p.caption ? ' — ' + p.caption : '') + (p.analysis ? ' — ' + p.analysis.replace(/\n/g, ' ') : '')); });
    }
    L.push(sep, 'Généré le ' + DM.fmtDateTime(r.generatedAt));
    return L.join('\n');
  };
})(window.DM);
