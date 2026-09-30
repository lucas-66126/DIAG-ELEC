/* DIAG-MAINT — tests unitaires (mini-harnais sans dépendance) */
(function (DM) {
  'use strict';
  const tests = [];
  function test(name, fn) { tests.push({ name: name, fn: fn }); }
  function eq(a, b, msg) { if (a !== b) throw new Error((msg || 'égalité') + ' — attendu ' + JSON.stringify(b) + ', obtenu ' + JSON.stringify(a)); }
  function ok(v, msg) { if (!v) throw new Error(msg || 'condition fausse'); }
  function throws(fn, re, msg) {
    try { fn(); } catch (e) { if (re && !re.test(e.message)) throw new Error((msg || 'message') + ' inattendu : ' + e.message); return; }
    throw new Error(msg || 'une erreur était attendue');
  }

  function base(extra) {
    return DM.createDiagnostic(Object.assign({
      name: 'Clim bureau 2', installationType: 'hvac', brand: 'Daikin', model: 'FTXM35', reference: 'R32-35',
      description: 'La climatisation ne refroidit plus depuis ce matin.', symptoms: 'Ne refroidit pas\nGivre sur l’évaporateur'
    }, extra || {}));
  }

  /* ---------- utilitaires ---------- */
  test('esc échappe le HTML', function () {
    eq(DM.esc('<img src=x onerror="a">&\''), '&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;');
    eq(DM.esc(null), '');
  });
  test('normText / hasKeyword : début de mot, sans accents', function () {
    const t = DM.normText('Le disjoncteur DÉCLENCHE; ne s’arrête plus');
    ok(DM.hasKeyword(t, 'disjonct'));
    ok(DM.hasKeyword(t, 'declench'));
    ok(DM.hasKeyword(t, 'ne s arrete'));
    ok(!DM.hasKeyword(t, 'onct'), 'ne doit pas matcher en milieu de mot');
  });

  /* ---------- création ---------- */
  test('createDiagnostic : champs et valeurs par défaut', function () {
    const d = base();
    eq(d.status, 'en_cours'); eq(d.hypotheses.length, 0); eq(d.controls.length, 0);
    eq(d.date, DM.todayISO()); ok(d.id.indexOf('diag_') === 0);
  });
  test('createDiagnostic : nom, type et description obligatoires', function () {
    throws(function () { DM.createDiagnostic({ installationType: 'hvac', description: 'x' }); }, /nom/);
    throws(function () { DM.createDiagnostic({ name: 'a', installationType: 'inconnu', description: 'x' }); }, /type/);
    throws(function () { DM.createDiagnostic({ name: 'a', installationType: 'hvac', description: '  ' }); }, /description/);
  });
  test('symptomList découpe par ligne et point-virgule', function () {
    eq(DM.symptomList({ symptoms: 'a\n b ;c\n\n' }).join('|'), 'a|b|c');
  });
  test('updateInfo met à jour et valide', function () {
    const d = base();
    DM.updateInfo(d, { brand: ' Mitsubishi ' });
    eq(d.brand, 'Mitsubishi');
    throws(function () { DM.updateInfo(d, { name: '' }); }, /nom/);
  });

  /* ---------- arbre ---------- */
  test('Hypothèse → contrôle → résultat → hypothèse dérivée', function () {
    const d = base();
    const h = DM.addHypothesis(d, { cause: 'Manque de fluide', reason: 'Givre' });
    const c = DM.addControl(d, { hypothesisId: h.id, type: 'visuel', description: 'Contrôler les filtres', expected: 'Propres' });
    throws(function () { DM.addHypothesis(d, { cause: 'Fils', parentControlId: c.id }); }, /résultat/, 'pas de dérivation sans résultat');
    DM.recordResult(d, c.id, { obtained: 'Filtres propres', verdict: 'conforme' });
    const h2 = DM.addHypothesis(d, { cause: 'Détendeur bloqué', parentControlId: c.id });
    eq(DM.childHypotheses(d, c.id)[0].id, h2.id);
    eq(DM.rootHypotheses(d).length, 1);
    eq(DM.hypothesisPath(d, h2.id).map(function (x) { return x.id; }).join(), [h.id, h2.id].join());
  });
  test('Règle : impossible de confirmer une hypothèse sans résultat de contrôle', function () {
    const d = base();
    const h = DM.addHypothesis(d, { cause: 'Condensateur HS' });
    throws(function () { DM.concludeHypothesis(d, h.id, 'confirmee', ''); }, /aucun contrôle/);
    const c = DM.addControl(d, { hypothesisId: h.id, type: 'visuel', description: 'Aspect du condensateur' });
    throws(function () { DM.concludeHypothesis(d, h.id, 'confirmee', ''); }, /aucun contrôle/, 'un contrôle non réalisé ne suffit pas');
    DM.acknowledgeSafety(d, c.id); // « condensateur » déclenche une consigne de décharge
    DM.recordResult(d, c.id, { obtained: 'Condensateur gonflé', verdict: 'non_conforme' });
    DM.concludeHypothesis(d, h.id, 'confirmee', 'Gonflé');
    eq(DM.hypothesisState(d, h), 'confirmee');
  });
  test('Écarter sans résultat exige une justification', function () {
    const d = base();
    const h = DM.addHypothesis(d, { cause: 'Variateur' });
    throws(function () { DM.concludeHypothesis(d, h.id, 'ecartee', ''); }, /justification/);
    DM.concludeHypothesis(d, h.id, 'ecartee', 'Pas de variateur sur cette machine');
    eq(DM.findHyp(d, h.id).status, 'ecartee');
  });
  // V2 : statuts explicites possible → suspectée → confirmée / écartée (ils ne changent jamais tout seuls)
  test('États V2 : possible → suspectée → confirmée', function () {
    const d = base();
    const h = DM.addHypothesis(d, { cause: 'X' });
    eq(DM.hypothesisState(d, h), 'possible');
    const c = DM.addControl(d, { hypothesisId: h.id, type: 'fonctionnel', description: 'Essai' });
    eq(DM.hypothesisState(d, h), 'possible');
    DM.recordResult(d, c.id, { obtained: 'KO', verdict: 'non_conforme' });
    eq(DM.hypothesisState(d, h), 'possible', 'un résultat ne change pas le statut à la place du technicien / de l’agent');
    DM.concludeHypothesis(d, h.id, 'suspectee', 'KO à l’essai');
    eq(DM.hypothesisState(d, h), 'suspectee');
    DM.concludeHypothesis(d, h.id, 'confirmee', '');
    eq(DM.hypothesisState(d, h), 'confirmee');
    // anciens statuts V1 toujours acceptés et convertis
    DM.concludeHypothesis(d, h.id, 'a_verifier', '');
    eq(h.status, 'possible');
  });
  test('Suppression d’hypothèse en cascade (contrôles + sous-hypothèses)', function () {
    const d = base();
    const h = DM.addHypothesis(d, { cause: 'A' });
    const c = DM.addControl(d, { hypothesisId: h.id, type: 'visuel', description: 'c1' });
    DM.recordResult(d, c.id, { obtained: 'r', verdict: 'conforme' });
    const h2 = DM.addHypothesis(d, { cause: 'B', parentControlId: c.id });
    DM.addControl(d, { hypothesisId: h2.id, type: 'visuel', description: 'c2' });
    DM.addHypothesis(d, { cause: 'Autre' });
    const n = DM.removeHypothesis(d, h.id);
    eq(n.hypotheses, 2); eq(n.controls, 2);
    eq(d.hypotheses.length, 1); eq(d.controls.length, 0);
  });
  test('Suppression de contrôle : hypothèses dérivées supprimées, confirmation révoquée', function () {
    const d = base();
    const h = DM.addHypothesis(d, { cause: 'A' });
    const c = DM.addControl(d, { hypothesisId: h.id, type: 'visuel', description: 'c1' });
    DM.recordResult(d, c.id, { obtained: 'r', verdict: 'non_conforme' });
    DM.addHypothesis(d, { cause: 'B', parentControlId: c.id });
    DM.concludeHypothesis(d, h.id, 'confirmee', '');
    DM.closeDiagnostic(d, { finalDiagnosis: 'A' });
    eq(d.status, 'cloture');
    DM.removeControl(d, c.id);
    eq(d.hypotheses.length, 1, 'B supprimée');
    eq(DM.findHyp(d, h.id).status, 'possible', 'plus confirmée sans résultat');
    eq(d.status, 'en_cours', 'diagnostic rouvert');
  });
  test('Contrôle général (sans hypothèse)', function () {
    const d = base();
    const c = DM.addControl(d, { type: 'fonctionnel', description: 'Lecture des codes défaut' });
    eq(c.hypothesisId, null);
    eq(DM.controlsOf(d, null).length, 1);
  });
  test('Contrôle : type invalide → visuel ; description obligatoire', function () {
    const d = base();
    eq(DM.addControl(d, { type: 'zzz', description: 'x' }).type, 'visuel');
    throws(function () { DM.addControl(d, { type: 'visuel', description: ' ' }); }, /obligatoire/);
  });
  test('updateControl empêche un cycle dans l’arbre', function () {
    const d = base();
    const h = DM.addHypothesis(d, { cause: 'A' });
    const c = DM.addControl(d, { hypothesisId: h.id, type: 'visuel', description: 'c' });
    DM.recordResult(d, c.id, { obtained: 'r', verdict: 'conforme' });
    const h2 = DM.addHypothesis(d, { cause: 'B', parentControlId: c.id });
    throws(function () { DM.updateControl(d, c.id, { hypothesisId: h2.id }); }, /découle/);
  });

  /* ---------- sécurité ---------- */
  test('Sécurité : mesure sous tension = danger + habilitation', function () {
    const s = DM.getSafety({ type: 'sous_tension', description: 'Mesurer U' }, 'electricite');
    eq(s.level, 'danger'); ok(s.requireAck);
    ok(s.points.join(' ').indexOf('Habilitation') !== -1);
  });
  test('Sécurité : hors tension = consignation + VAT', function () {
    const s = DM.getSafety({ type: 'hors_tension', description: 'Mesurer isolement' }, 'moteur');
    eq(s.level, 'warning');
    ok(/consignation/i.test(s.title));
    ok(s.points.some(function (p) { return /VAT/.test(p); }));
  });
  test('Sécurité : mots-clés (condensateur, 400 V)', function () {
    const s1 = DM.getSafety({ type: 'visuel', description: 'Inspecter le condensateur' }, 'hvac');
    eq(s1.level, 'warning'); ok(s1.points.some(function (p) { return /condensateurs/.test(p); }));
    const s2 = DM.getSafety({ type: 'hors_tension', description: 'Serrage jeu de barres TGBT 400 V' }, 'electricite');
    eq(s2.level, 'danger');
  });
  test('Sécurité : essai incendie → prévenir l’exploitant', function () {
    const s = DM.getSafety({ type: 'fonctionnel', description: 'Tester détecteur' }, 'incendie');
    ok(s.requireAck); ok(s.points.some(function (p) { return /exploitant/.test(p); }));
  });
  test('Sécurité : contrôle visuel anodin = aucune alerte', function () {
    const s = DM.getSafety({ type: 'visuel', description: 'Relever la plaque signalétique' }, 'autre');
    eq(s.level, null); ok(!s.requireAck);
  });
  test('Résultat refusé tant que les consignes ne sont pas validées', function () {
    const d = base();
    const c = DM.addControl(d, { type: 'sous_tension', description: 'Mesurer la tension' });
    throws(function () { DM.recordResult(d, c.id, { obtained: '230 V', verdict: 'conforme' }); }, /sécurité/);
    DM.acknowledgeSafety(d, c.id);
    DM.recordResult(d, c.id, { obtained: '230 V', measureValue: '230', measureUnit: 'V', verdict: 'conforme' });
    ok(DM.hasResult(DM.findControl(d, c.id)));
  });
  test('Modifier la nature d’un contrôle réinitialise la validation sécurité', function () {
    const d = base();
    const c = DM.addControl(d, { type: 'hors_tension', description: 'Isolement' });
    DM.acknowledgeSafety(d, c.id);
    DM.updateControl(d, c.id, { type: 'sous_tension' });
    eq(DM.findControl(d, c.id).safetyAck, null);
  });
  test('Rappel de consignation pour les domaines électriques', function () {
    ok(DM.domainSafetyReminder('electricite'));
    eq(DM.domainSafetyReminder('autre'), null);
  });

  /* ---------- suggestions ---------- */
  test('Suggestions HVAC : manque de fluide en tête pour « ne refroidit pas + givre »', function () {
    const s = DM.suggestHypotheses(base());
    ok(s.length > 3);
    eq(s[0].template.cause, 'Manque de fluide frigorigène (fuite)');
    ok(s[0].matched.indexOf('givre') !== -1);
  });
  test('Suggestions : « depuis ce matin » ne suggère pas une intervention récente', function () {
    const s = DM.suggestHypotheses(base());
    const iv = s.find(function (x) { return /intervention récente/.test(x.template.cause); });
    eq(iv.score, 0);
    const d2 = base({ description: 'Ne refroidit plus depuis l’intervention d’hier' });
    ok(DM.suggestHypotheses(d2).find(function (x) { return /intervention récente/.test(x.template.cause); }).score > 0);
  });
  test('Suggestions : exclut les hypothèses déjà présentes', function () {
    const d = base();
    DM.addHypothesis(d, { cause: 'Manque de fluide frigorigène (fuite)' });
    ok(DM.suggestHypotheses(d).every(function (x) { return x.template.cause !== 'Manque de fluide frigorigène (fuite)'; }));
  });
  test('Suggestions électricité : différentiel + humidité → défaut d’isolement', function () {
    const d = DM.createDiagnostic({ name: 'Prises atelier', installationType: 'electricite', description: 'Le différentiel déclenche quand il pleut', symptoms: 'Humidité dans le local' });
    eq(DM.suggestHypotheses(d)[0].template.cause, 'Défaut d’isolement');
  });
  test('Base de connaissances : chaque domaine a des hypothèses et contrôles valides', function () {
    DM.INSTALL_TYPES.forEach(function (t) {
      if (t.id === 'autre') return;
      ok((DM.KB[t.id] || []).length >= 4, 'domaine ' + t.id);
    });
    Object.keys(DM.KB).forEach(function (k) {
      DM.KB[k].forEach(function (h) {
        ok(h.cause && h.reason && h.keywords.length && h.controls.length, h.id);
        h.controls.forEach(function (c) { ok(DM.CONTROL_TYPES[c.type], h.id + ' type ' + c.type); ok(c.description && c.expected, h.id); });
        ok(DM.findTemplate(h.id) === h);
      });
    });
  });

  /* ---------- clôture, étapes ---------- */
  test('Clôture : exige une hypothèse confirmée et un diagnostic final rédigé', function () {
    const d = base();
    throws(function () { DM.closeDiagnostic(d, { finalDiagnosis: 'x' }); }, /aucune hypothèse/);
    const h = DM.addHypothesis(d, { cause: 'A' });
    const c = DM.addControl(d, { hypothesisId: h.id, type: 'visuel', description: 'c' });
    DM.recordResult(d, c.id, { obtained: 'r', verdict: 'non_conforme' });
    DM.concludeHypothesis(d, h.id, 'confirmee', '');
    throws(function () { DM.closeDiagnostic(d, { finalDiagnosis: '' }); }, /diagnostic final/);
    DM.closeDiagnostic(d, { finalDiagnosis: 'A', repair: 'Remplacement', recommendations: 'Surveiller' });
    eq(d.status, 'cloture'); eq(d.repair, 'Remplacement');
    DM.reopenDiagnostic(d); eq(d.status, 'en_cours');
  });
  test('Étapes de la démarche', function () {
    const d = base();
    eq(DM.currentStep(d), 0);
    const h = DM.addHypothesis(d, { cause: 'A' }); eq(DM.currentStep(d), 1);
    const c = DM.addControl(d, { hypothesisId: h.id, type: 'visuel', description: 'c' }); eq(DM.currentStep(d), 2);
    DM.recordResult(d, c.id, { obtained: 'r', verdict: 'non_conforme' }); eq(DM.currentStep(d), 3);
    DM.concludeHypothesis(d, h.id, 'confirmee', ''); eq(DM.currentStep(d), 4);
  });

  /* ---------- duplication ---------- */
  test('Duplication : nouveaux identifiants, arbre conservé, liens remappés', function () {
    const d = base();
    const h = DM.addHypothesis(d, { cause: 'A' });
    const c = DM.addControl(d, { hypothesisId: h.id, type: 'visuel', description: 'c' });
    DM.recordResult(d, c.id, { obtained: 'r', verdict: 'conforme' });
    DM.addHypothesis(d, { cause: 'B', parentControlId: c.id });
    d.photos = [{ id: 'pho_1', caption: 'plaque' }];
    const x = DM.duplicateDiagnostic(d, { photoMap: { pho_1: 'pho_2' } });
    ok(x.id !== d.id); eq(x.name, 'Clim bureau 2 (copie)');
    eq(x.hypotheses.length, 2); eq(x.controls.length, 1);
    ok(x.hypotheses.every(function (hh) { return !DM.findHyp(d, hh.id); }), 'ids régénérés');
    eq(x.controls[0].hypothesisId, x.hypotheses[0].id);
    eq(x.hypotheses[1].parentControlId, x.controls[0].id);
    eq(x.photos[0].id, 'pho_2'); eq(x.photos[0].caption, 'plaque');
    eq(DM.duplicateDiagnostic(d).photos.length, 0);
    eq(d.hypotheses[0].id, h.id, 'original intact');
  });

  /* ---------- compte-rendu ---------- */
  test('Compte-rendu : sections et contenu', function () {
    const d = base();
    const h = DM.addHypothesis(d, { cause: 'Condensateur HS' });
    const c = DM.addControl(d, { hypothesisId: h.id, type: 'hors_tension', description: 'Mesurer la capacité', expected: '35 µF ±5 %' });
    DM.acknowledgeSafety(d, c.id);
    DM.recordResult(d, c.id, { obtained: 'Capacité faible', measureValue: '12', measureUnit: 'µF', verdict: 'non_conforme' });
    DM.addControl(d, { type: 'visuel', description: 'Non réalisé' });
    DM.concludeHypothesis(d, h.id, 'confirmee', '');
    DM.closeDiagnostic(d, { finalDiagnosis: 'Condensateur de démarrage HS', repair: 'Condensateur remplacé', recommendations: 'Contrôle annuel' });
    const r = DM.buildReport(d, { technician: 'J. Martin' });
    eq(r.controls.length, 1); eq(r.pendingControls, 1);
    eq(r.measures[0].value, '12 µF'); ok(r.isConfirmed);
    const t = DM.reportToText(r);
    ['MATÉRIEL', 'PANNE CONSTATÉE', 'SYMPTÔMES', 'CONTRÔLES RÉALISÉS', 'MESURES', 'DIAGNOSTIC', 'RÉPARATION EFFECTUÉE', 'RECOMMANDATIONS',
      'Daikin', '12 µF', 'Condensateur remplacé', 'Contrôle annuel', 'J. Martin'].forEach(function (s) { ok(t.indexOf(s) !== -1, 'texte contient ' + s); });
  });
  test('Compte-rendu : avertit si aucune hypothèse confirmée', function () {
    const t = DM.reportToText(DM.buildReport(base()));
    ok(t.indexOf('diagnostic non établi') !== -1);
  });

  /* ---------- stockage ---------- */
  test('Store : CRUD + tri + persistance (stockage injecté)', function () {
    const mem = DM.memoryStorage();
    const s = DM.createStore(mem);
    const a = base({ name: 'A' }), b = base({ name: 'B' });
    s.save(a); s.save(b);
    eq(s.all().length, 2);
    a.brand = 'Modifié'; a.updatedAt = '2999-01-01T00:00:00Z'; s.save(a);
    eq(s.all()[0].name, 'A', 'tri par date de modification');
    eq(DM.createStore(mem).get(a.id).brand, 'Modifié', 'relu depuis le stockage');
    const got = s.get(b.id); got.name = 'altéré'; eq(s.get(b.id).name, 'B', 'copies défensives');
    s.remove(a.id); eq(s.all().length, 1);
    s.saveSettings({ technician: 'X' }); eq(s.settings().technician, 'X'); eq(s.settings().theme, 'auto');
  });
  test('Store : erreur explicite si stockage plein', function () {
    const full = { getItem: function () { return null; }, setItem: function () { const e = new Error('q'); e.name = 'QuotaExceededError'; throw e; } };
    throws(function () { DM.createStore(full).save(base()); }, /plein/);
  });

  /* ---------- exécution ---------- */
  const ul = document.getElementById('results');
  let pass = 0, fail = 0;
  tests.forEach(function (t) {
    const li = document.createElement('li');
    try { t.fn(); pass++; li.className = 'ok'; li.textContent = '✔ ' + t.name; }
    catch (e) {
      fail++; li.className = 'ko'; li.textContent = '✘ ' + t.name;
      const pre = document.createElement('pre'); pre.textContent = e.message; li.appendChild(pre);
      console.error(t.name, e);
    }
    ul.appendChild(li);
  });
  const sum = document.getElementById('summary');
  sum.textContent = (fail ? 'ÉCHEC' : 'SUCCÈS') + ' — ' + pass + ' réussi(s), ' + fail + ' échoué(s) sur ' + tests.length;
  sum.className = fail ? 'ko' : 'ok';
  window.TEST_RESULTS = { pass: pass, fail: fail, total: tests.length };
})(window.DM);
