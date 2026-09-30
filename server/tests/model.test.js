'use strict';
/* Modèle V2 : diagnostic, photos, mesures, hypothèses, statuts, sauvegarde, historique, rapport. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { DM } = require('./helpers');

function base() {
  return DM.createDiagnostic({ name: 'Clim bureau', installationType: 'hvac', brand: 'Mitsubishi', description: 'Le C20 déclenche après 5 minutes', symptoms: 'Déclenchement C20' });
}

test('création d’un diagnostic (formulaire et brouillon agent)', () => {
  const d = base();
  assert.equal(d.schema, 2);
  assert.equal(d.verdict.status, 'non_confirme');
  assert.deepEqual([d.measurements, d.facts, d.messages, d.parts], [[], [], [], []]);
  assert.throws(() => DM.createDiagnostic({ name: '', installationType: 'hvac', description: 'x' }), /nom/);
  const draft = DM.createDraft();
  assert.equal(draft.mode, 'agent');
  assert.match(draft.name, /^Diagnostic du /);
});

test('migration d’un diagnostic V1 (statuts, champs manquants)', () => {
  const v1 = { id: 'diag_ancien01', schema: 1, name: 'V1', installationType: 'moteur', description: 'x', symptoms: '', status: 'cloture',
    photos: [{ id: 'pho_abc123', caption: '' }],
    hypotheses: [{ id: 'hyp_a1b2c3', cause: 'A', status: 'a_verifier' }, { id: 'hyp_d4e5f6', cause: 'B', status: 'confirmee' }],
    controls: [{ id: 'ctl_1a2b3c', hypothesisId: 'hyp_d4e5f6', type: 'visuel', description: 'c', obtained: 'r', doneAt: '2026-01-01', verdict: 'non_conforme' }] };
  const d = DM.normalizeDiag(v1);
  assert.equal(d.schema, 2);
  assert.equal(d.hypotheses[0].status, 'possible');
  assert.deepEqual(d.hypotheses[0].evidence, []);
  assert.equal(d.photos[0].kind, 'autre');
  assert.equal(d.verdict.status, 'confirme', 'un V1 clôturé avec hypothèse confirmée → verdict confirmé');
  assert.deepEqual(DM.normalizeDiag(DM.clone(d)), d, 'idempotent');
});

test('ajout d’une photo typée et de son analyse', () => {
  const d = base();
  d.photos.push({ id: 'pho_plaque01', kind: 'plaque', caption: 'Unité extérieure' });
  DM.setPhotoAnalysis(d, 'pho_plaque01', 'Référence lisible : MUZ-LN35VG');
  assert.equal(d.photos[0].analysis.text, 'Référence lisible : MUZ-LN35VG');
  assert.throws(() => DM.setPhotoAnalysis(d, 'pho_inconnue', 'x'), /introuvable/);
  assert.equal(DM.PHOTO_KINDS.ecran_defaut, 'Écran de défaut');
});

test('ajout d’une mesure : date, heure, contrôle, emplacement, unité, résultat', () => {
  const d = base();
  const c = DM.addControl(d, { type: 'sous_tension', description: 'Tension alimentation' });
  const m = DM.addMeasurement(d, { kind: 'tension', label: 'Tension L-N', value: '230', unit: 'V', location: 'Unité extérieure', controlId: c.id, result: 'conforme' });
  assert.ok(m.at && m.id);
  assert.equal(DM.formatMeasurement(m), 'Tension L-N = 230 V (Unité extérieure)');
  assert.deepEqual(DM.measurementsOf(d, c.id).map(x => x.id), [m.id]);
  assert.throws(() => DM.addMeasurement(d, { kind: 'tension', value: '' }), /obligatoire/);
  const code = DM.addMeasurement(d, { kind: 'code', value: 'E6' });
  assert.equal(code.unit, '');
  const yn = DM.addMeasurement(d, { kind: 'ouinon', label: 'Ventilateur tourne', value: 'non' });
  assert.equal(yn.kind, 'ouinon');
  assert.equal(DM.kindFromUnit('MΩ'), 'isolement');
  assert.equal(DM.kindFromUnit('A'), 'courant');
});

test('création d’une hypothèse avec preuves et contre-preuves', () => {
  const d = base();
  const h = DM.addHypothesis(d, { cause: 'Surintensité compresseur', reason: 'C20 seul après 5 min', status: 'suspectee' });
  assert.equal(h.status, 'suspectee');
  DM.addEvidence(d, h.id, { text: 'Différentiel ne déclenche pas' });
  DM.addEvidence(d, h.id, { text: 'Différentiel ne déclenche pas' }); // doublon ignoré
  DM.addEvidence(d, h.id, { text: 'Tension correcte', against: true });
  assert.equal(h.evidence.length, 1);
  assert.equal(h.counterEvidence.length, 1);
  assert.throws(() => DM.addHypothesis(d, { cause: ' ' }), /obligatoire/);
});

test('changement de statut : règles de preuve', () => {
  const d = base();
  const h = DM.addHypothesis(d, { cause: 'A' });
  assert.throws(() => DM.concludeHypothesis(d, h.id, 'confirmee', ''), /aucun contrôle/);
  assert.throws(() => DM.concludeHypothesis(d, h.id, 'ecartee', ''), /justification/);
  DM.concludeHypothesis(d, h.id, 'suspectee', '');
  assert.equal(h.status, 'suspectee');
  assert.throws(() => DM.setVerdict(d, { status: 'probable', summary: 'x' }), /preuve/);
  DM.addEvidence(d, h.id, { text: 'indice' });
  DM.setVerdict(d, { status: 'probable', summary: 'A probable', missing: ['mesure X1-X2'] });
  assert.throws(() => DM.setVerdict(d, { status: 'confirme', summary: 'x' }), /confirmé/);
  const c = DM.addControl(d, { hypothesisId: h.id, type: 'visuel', description: 'Inspection' });
  DM.recordResult(d, c.id, { obtained: 'Brûlé', verdict: 'non_conforme' });
  DM.concludeHypothesis(d, h.id, 'confirmee', '');
  DM.setVerdict(d, { status: 'confirme', summary: 'A' });
  assert.equal(d.verdict.status, 'confirme');
  DM.removeControl(d, c.id);
  assert.equal(h.status, 'possible', 'plus de résultat → plus confirmée');
  assert.equal(d.verdict.status, 'non_confirme', 'verdict rétrogradé');
});

test('mémoire : un fait déjà connu est mis à jour, pas dupliqué', () => {
  const d = base();
  DM.recordFact(d, { question: 'Le différentiel déclenche-t-il ?', answer: 'Non' });
  DM.recordFact(d, { question: 'le différentiel déclenche-t-il', answer: 'Non, jamais' });
  assert.equal(d.facts.length, 1);
  assert.equal(d.facts[0].answer, 'Non, jamais');
  assert.ok(DM.findFact(d, 'Le différentiel déclenche-t-il ?'));
});

test('niveaux de risque 1 à 4', () => {
  assert.equal(DM.riskLevel({ type: 'visuel', description: 'Relever la plaque' }, 'autre').level, 1);
  assert.equal(DM.riskLevel({ type: 'hors_tension', description: 'Isolement moteur' }, 'moteur').level, 2);
  assert.equal(DM.riskLevel({ type: 'sous_tension', description: 'Intensité absorbée' }, 'hvac').level, 3);
  assert.equal(DM.riskLevel({ type: 'sous_tension', description: 'Mesure sur jeu de barres TGBT 400 V' }, 'electricite').level, 4);
  assert.equal(DM.riskLevel({ type: 'visuel', description: 'Relever la plaque', risk: 3 }, 'autre').level, 3, 'relevé par l’agent');
  assert.equal(DM.riskLevel({ type: 'sous_tension', description: 'Tension', risk: 1 }, 'electricite').level, 3, 'jamais abaissé');
  const r = DM.riskLevel({ type: 'sous_tension', description: 'Tension' }, 'electricite');
  assert.ok(r.precautions.some(p => /conducteur sous tension/.test(p)));
  assert.ok(r.precautions.some(p => /calibre supérieur/.test(p)));
});

test('plan de contrôle : pistes suspectées et contrôles simples d’abord', () => {
  const d = base();
  const a = DM.addHypothesis(d, { cause: 'A' });
  const b = DM.addHypothesis(d, { cause: 'B' });
  const ca = DM.addControl(d, { hypothesisId: a.id, type: 'sous_tension', description: 'Tension' });
  const ca2 = DM.addControl(d, { hypothesisId: a.id, type: 'visuel', description: 'Aspect' });
  const cb = DM.addControl(d, { hypothesisId: b.id, type: 'visuel', description: 'Filtre' });
  assert.equal(DM.nextControl(d).id, ca2.id, 'hypothèse la plus pertinente, contrôle le moins risqué');
  DM.concludeHypothesis(d, b.id, 'suspectee', '');
  assert.equal(DM.nextControl(d).id, cb.id, 'piste suspectée prioritaire');
  assert.ok(ca);
});

test('sauvegarde et récupération de l’historique (stockage persistant simulé)', () => {
  const mem = DM.memoryStorage();
  const store = DM.createStore(mem);
  const a = base(); a.name = 'A';
  const b = base(); b.name = 'B'; b.updatedAt = '2999-01-01T00:00:00Z';
  DM.addMessage(a, { role: 'user', text: 'Bonjour' });
  store.save(a); store.save(b);
  const reloaded = DM.createStore(mem); // « réouverture de l'application »
  const all = reloaded.all();
  assert.deepEqual(all.map(x => x.name), ['B', 'A'], 'du plus récent au plus ancien');
  assert.equal(reloaded.get(a.id).messages[0].text, 'Bonjour');
  // les collections V2 sont séparées
  reloaded.equipments.save({ id: 'eq_1', updatedAt: 'x' });
  assert.equal(DM.createStore(mem).equipments.all().length, 1);
});

test('génération du rapport V2', () => {
  const d = base();
  d.client = 'Mairie'; d.site = 'Bâtiment A'; d.reference = 'MUZ-LN35VG';
  d.photos.push({ id: 'pho_plaque01', kind: 'plaque' });
  DM.recordFact(d, { question: 'Différentiel', answer: 'Ne déclenche pas' });
  const h = DM.addHypothesis(d, { cause: 'Condensateur compresseur HS' });
  const c = DM.addControl(d, { hypothesisId: h.id, type: 'hors_tension', description: 'Capacité du condensateur', expected: '35 µF ±5 %' });
  DM.addMeasurement(d, { kind: 'capacite', label: 'Capacité condensateur', value: '12', unit: 'µF', location: 'Unité extérieure', controlId: c.id, result: 'non_conforme' });
  DM.recordResult(d, c.id, { obtained: '12 µF', verdict: 'non_conforme' }, { declaredInChat: true });
  DM.concludeHypothesis(d, h.id, 'confirmee', '');
  DM.closeDiagnostic(d, { finalDiagnosis: 'Condensateur HS', repair: 'Remplacement', recommendations: 'Contrôle annuel', finalResult: 'resolu',
    parts: [{ designation: 'Condensateur 35 µF', reference: 'C35-450', quantity: '1' }] });
  const r = DM.buildReport(d, { technician: 'J. Martin' });
  assert.equal(r.verdict.label, 'Diagnostic confirmé');
  assert.equal(r.parts.length, 1);
  assert.equal(r.finalResult, 'Panne résolue');
  assert.equal(r.measures[0].location, 'Unité extérieure');
  assert.ok(r.controls[0].safetyDeclared, 'consignes non validées formellement tracées');
  const t = DM.reportToText(r);
  ['Mairie', 'Bâtiment A', 'MUZ-LN35VG', 'J. Martin', 'PIÈCES UTILISÉES', 'C35-450', 'RÉSULTAT FINAL', 'Panne résolue', 'MESURES',
    '12 µF', 'Unité extérieure', 'PHOTOS', 'Plaque signalétique', 'RECOMMANDATIONS', 'DIAGNOSTIC — DIAGNOSTIC CONFIRMÉ']
    .forEach(s => assert.ok(t.includes(s), 'le rapport contient « ' + s + ' »'));
});

test('rapport d’un diagnostic non confirmé : mention explicite', () => {
  const d = base();
  const h = DM.addHypothesis(d, { cause: 'A' });
  DM.addEvidence(d, h.id, { text: 'indice' });
  DM.concludeHypothesis(d, h.id, 'suspectee', '');
  DM.setVerdict(d, { status: 'probable', summary: 'A', missing: ['Tension X1-X2 au démarrage'] });
  const t = DM.reportToText(DM.buildReport(d));
  assert.ok(t.includes('Diagnostic probable'.toUpperCase()));
  assert.ok(t.includes('Tension X1-X2 au démarrage'));
  assert.ok(t.includes('diagnostic non établi'));
});

test('base de connaissances : panne similaire, même référence, même code, même symptôme', () => {
  const mk = (name, ref, desc, code, cause) => {
    const d = DM.createDiagnostic({ name, installationType: 'hvac', brand: 'Mitsubishi', reference: ref, description: desc, symptoms: desc });
    if (code) DM.addMeasurement(d, { kind: 'code', value: code });
    const h = DM.addHypothesis(d, { cause });
    const c = DM.addControl(d, { hypothesisId: h.id, type: 'visuel', description: 'x' });
    DM.recordResult(d, c.id, { obtained: 'y', verdict: 'non_conforme' });
    DM.concludeHypothesis(d, h.id, 'confirmee', '');
    DM.closeDiagnostic(d, { finalDiagnosis: cause });
    return d;
  };
  const entries = DM.kb.fromDiagnostics([
    mk('Clim A', 'MUZ-LN35VG', 'Disjoncteur C20 déclenche après quelques minutes', null, 'Compresseur en court-circuit partiel'),
    mk('Clim B', 'PUHZ-ZRP71', 'Affiche le code défaut E6, pas de froid', 'E6', 'Défaut communication'),
    DM.createDiagnostic({ name: 'Non terminé', installationType: 'hvac', description: 'Disjoncteur déclenche' })
  ]);
  assert.equal(entries.length, 2, 'seuls les diagnostics aboutis deviennent des connaissances');
  assert.equal(DM.kb.search(entries, { mode: 'reference', reference: 'muz-ln35vg' })[0].entry.title, 'Clim A');
  assert.equal(DM.kb.search(entries, { mode: 'code', code: 'e6' })[0].entry.title, 'Clim B');
  assert.equal(DM.kb.search(entries, { mode: 'symptome', symptom: 'le disjoncteur déclenche' })[0].entry.title, 'Clim A');
  const sim = DM.kb.search(entries, { mode: 'similaire', text: 'Le C20 déclenche après 5 minutes', installationType: 'hvac', brand: 'Mitsubishi' });
  assert.equal(sim[0].entry.title, 'Clim A');
  assert.ok(DM.kb.summary(sim[0].entry).includes('Cause confirmée'));
  assert.deepEqual(DM.extractErrorCodes('La télécommande affiche le code E6 puis défaut P8'), ['E6', 'P8']);
});
