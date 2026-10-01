'use strict';
/* Banque de cas : le moteur local rejoue chaque cas comme un technicien (voir tests/cas/banc.js).
 * Non-régression : un cas résolu ne doit plus jamais échouer. Détail : « npm run cas ». */
const test = require('node:test');
const assert = require('node:assert/strict');
const banc = require('./cas/banc');
const DM = require('../src/core');

test('banque de cas : chaque cas est bien formé', () => {
  const cas = banc.charger();
  assert.ok(cas.length >= 190, 'la banque ne doit pas rétrécir : ' + cas.length + ' cas');
  const ids = new Set();
  cas.forEach((c) => {
    assert.ok(c.id && !ids.has(c.id), 'identifiant unique : ' + c.id);
    ids.add(c.id);
    assert.ok(c.description && c.description.length > 20, c.id + ' : description');
    assert.ok(c.attendu instanceof RegExp, c.id + ' : cause attendue');
    assert.ok(c.controles.length >= 1, c.id + ' : au moins une mesure ou un constat disponible');
  });
});

test('banque de cas : tous les cas sont résolus par le moteur local, sans IA', async () => {
  const resultats = await banc.jouerTout();
  const echecs = resultats.filter((r) => !r.ok).map((r) => r.cas.id + ' (' + r.raison + (r.confirme ? ' : ' + r.confirme : '') + ')');
  assert.deepEqual(echecs, [], 'cas en échec');
  const b = banc.bilan(resultats);
  assert.ok(b.toursMedian <= 8, 'nombre médian d’échanges : ' + b.toursMedian);
});

test('banque de cas : aucune mesure n’est enregistrée sans avoir été donnée par le technicien', async () => {
  const c = banc.charger().find((x) => x.id === 'mot-04');
  const r = await banc.jouer(c);
  const dit = r.journal.map((j) => j.technicien).join(' ').replace(/,/g, '.');
  r.diag.measurements.forEach((m) => {
    const chiffres = String(m.value).replace(',', '.').replace(/[^0-9.]/g, '');
    assert.ok(dit.includes(chiffres), 'valeur ' + m.value + ' ' + m.unit + ' absente des messages du technicien');
  });
});

test('base de pannes : chaque cause a des contrôles, une réparation conseillée et un contrôle final', () => {
  let causes = 0;
  Object.keys(DM.KB).forEach((k) => {
    DM.KB[k].forEach((t) => {
      causes++;
      assert.ok(t.cause && t.reason && t.keywords.length && t.controls.length, t.id);
      assert.ok(t.advice && t.advice.length > 30, t.id + ' : réparation conseillée');
      t.controls.forEach((c) => {
        assert.ok(DM.CONTROL_TYPES[c.type], t.id + ' : type de contrôle');
        assert.ok(c.description && c.expected, t.id + ' : contrôle complet');
        if (c.localize) assert.ok(c.onConform, t.id + ' : un contrôle de localisation dit ce qu’on déduit d’un résultat conforme');
      });
      t.keywords.forEach((w) => assert.equal(w, DM.normalize(w), t.id + ' : mot-clé en minuscules sans accents (' + w + ')'));
    });
  });
  assert.ok(causes >= 165, 'la base ne doit pas rétrécir : ' + causes + ' causes');
});

test('moteur local : « rien d’anormal » et « pas bon » sont compris', async () => {
  for (const [reponse, verdict] of [['Rien d’anormal, pas de trace d’humidité', 'conforme'], ['c est pas bon', 'non_conforme'], ['bobine coupée', 'non_conforme'], ['aucune fuite, RAS', 'conforme']]) {
    const d = DM.createDraft({});
    d.installationType = 'pompe';
    d.description = 'essai';
    const c = DM.addControl(d, { type: 'visuel', description: 'Inspecter la sortie d’arbre', expected: 'Pas de fuite', proposedBy: 'agent' });
    DM.addMessage(d, { role: 'assistant', text: 'Contrôle', ask: { question: 'Résultat ?', choices: [], kind: 'result', controlId: c.id }, controlId: c.id });
    DM.addMessage(d, { role: 'user', text: reponse });
    const out = await DM.agent.runLocalTurn({ diag: d, services: {} });
    assert.equal(DM.findControl(out.diag, c.id).verdict, verdict, reponse);
  }
});
