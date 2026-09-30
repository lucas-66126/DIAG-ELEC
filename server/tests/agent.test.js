'use strict';
/* Agent : boucle d'outils, garde-fous, mémoire, reprise de conversation, erreurs, scénario Mitsubishi. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { DM, JPEG_1PX, scriptedProvider, toolUse, tools, text, lastToolResults } = require('./helpers');

const kbService = { entries: async () => [] };

function newDiag() { return DM.createDraft({}); }
/** Instantané d'état envoyé au modèle pendant ce tour (où qu'il soit dans les messages). */
function snapshotOf(req) {
  for (const m of req.messages) {
    if (Array.isArray(m.content)) {
      const b = m.content.find(x => x.type === 'text' && x.text.includes('<etat_du_diagnostic'));
      if (b) return b.text;
    }
  }
  return '';
}
function userSays(d, t, extra) { DM.addMessage(d, Object.assign({ role: 'user', text: t }, extra || {})); return d; }

test('boucle d’outils : exécution, traces, mise à jour de l’état', async () => {
  const d = userSays(newDiag(), 'Ma clim Mitsubishi fait déclencher le C20 extérieur.');
  const p = scriptedProvider([
    tools(
      toolUse('update_equipment', { installation_type: 'hvac', brand: 'Mitsubishi', name: 'Clim Mitsubishi — C20 déclenche' }),
      toolUse('set_fault', { description: 'Le C20 de l’unité extérieure déclenche', symptoms_add: ['Déclenchement du C20'] }),
      toolUse('record_fact', { question: 'Protection qui déclenche', answer: 'C20 (unité extérieure)' })
    ),
    tools(toolUse('ask_user', { question: 'Depuis combien de temps fonctionne-t-elle avant le déclenchement ?', kind: 'fact' })),
    text('D’accord. Depuis combien de temps fonctionne-t-elle avant le déclenchement ?')
  ]);
  const out = await DM.agent.runTurn({ provider: p, diag: d, system: 'test', services: { knowledge: kbService } });
  assert.equal(out.diag.brand, 'Mitsubishi');
  assert.equal(out.diag.installationType, 'hvac');
  assert.equal(out.diag.facts.length, 1);
  assert.equal(out.ask.question, 'Depuis combien de temps fonctionne-t-elle avant le déclenchement ?');
  assert.equal(out.diag.messages.length, 2);
  assert.equal(out.diag.messages[1].role, 'assistant');
  assert.equal(out.diag.messages[0].pending, false);
  assert.ok(out.trace.some(t => t.label === 'Matériel identifié'));
  // le fournisseur a reçu l'instantané d'état et la liste d'outils
  assert.ok(p.requests[0].messages[0].content[0].text.includes('<etat_du_diagnostic'));
  assert.ok(p.requests[0].tools.includes('propose_control'));
  assert.equal(d.messages.length, 1, 'le diagnostic d’entrée n’est pas modifié (copie de travail)');
});

test('mémoire : ne repose pas une question déjà répondue', async () => {
  const d = newDiag();
  DM.recordFact(d, { question: 'Le différentiel en amont déclenche-t-il ?', answer: 'Non' });
  userSays(d, 'Et maintenant ?');
  const p = scriptedProvider([
    tools(toolUse('ask_user', { question: 'Le différentiel en amont déclenche-t-il également ?', choices: ['Oui', 'Non'] })),
    (req) => {
      const r = lastToolResults(req)[0];
      assert.equal(r.is_error, true);
      assert.match(r.content, /Déjà connu/);
      return text('Le différentiel ne déclenche pas : on continue.');
    }
  ]);
  const out = await DM.agent.runTurn({ provider: p, diag: d, services: {} });
  assert.equal(out.ask, null);
  // le fait connu figure dans l'instantané envoyé au modèle
  assert.ok(p.requests[0].messages[0].content[0].text.includes('Le différentiel en amont déclenche-t-il ? → Non'));
});

test('garde-fou : une mesure absente du message du technicien est refusée', async () => {
  const d = userSays(newDiag(), 'J’ai mesuré 18,5 A sur la phase.');
  const p = scriptedProvider([
    tools(
      toolUse('save_measurement', { kind: 'courant', label: 'Intensité', value: '18,5', unit: 'A' }),
      toolUse('save_measurement', { kind: 'tension', label: 'Tension', value: '230', unit: 'V' })
    ),
    (req) => {
      const [ok, ko] = lastToolResults(req);
      assert.ok(!ok.is_error);
      assert.equal(ko.is_error, true);
      assert.match(ko.content, /ne jamais inventer/);
      return text('Noté : 18,5 A.');
    }
  ]);
  const out = await DM.agent.runTurn({ provider: p, diag: d, services: {} });
  assert.deepEqual(out.diag.measurements.map(m => m.value), ['18,5']);
});

test('garde-fous : pas de confirmation sans résultat, pas de contrôle refait', async () => {
  const d = newDiag();
  d.installationType = 'hvac';
  const h = DM.addHypothesis(d, { cause: 'Condensateur HS' });
  const c = DM.addControl(d, { hypothesisId: h.id, type: 'hors_tension', description: 'Mesurer la capacité du condensateur de démarrage' });
  userSays(d, 'Je pense que c’est le condensateur');
  const p = scriptedProvider([
    tools(
      toolUse('upsert_hypothesis', { id: h.id, status: 'confirmee' }),
      toolUse('set_diagnosis_status', { status: 'confirme', summary: 'Condensateur' })
    ),
    (req) => {
      const [r1, r2] = lastToolResults(req);
      assert.equal(r1.is_error, true); assert.match(r1.content, /Impossible de confirmer/);
      assert.equal(r2.is_error, true); assert.match(r2.content, /confirmé/);
      return text('Pas encore : il faut mesurer la capacité.');
    }
  ]);
  await DM.agent.runTurn({ provider: p, diag: d, services: {} });

  // contrôle déjà réalisé → refusé
  DM.recordResult(d, c.id, { obtained: '12 µF', verdict: 'non_conforme' }, { declaredInChat: true });
  userSays(d, 'suite');
  const p2 = scriptedProvider([
    tools(toolUse('propose_control', { description: 'Mesurer la capacité du condensateur de démarrage', type: 'hors_tension', why: 'vérifier' })),
    (req) => { assert.match(lastToolResults(req)[0].content, /déjà réalisé/); return text('ok'); }
  ]);
  await DM.agent.runTurn({ provider: p2, diag: d, services: {} });
});

test('propose_control : niveau de risque calculé, jamais abaissé par l’IA', async () => {
  const d = userSays(newDiag(), 'go');
  d.installationType = 'electricite';
  let result;
  const p = scriptedProvider([
    tools(toolUse('propose_control', { description: 'Mesurer la tension L-N au bornier', type: 'sous_tension', why: 'alimentation', risk_level: 1 })),
    (req) => { result = JSON.parse(lastToolResults(req)[0].content); return text('Contrôle n°1…'); }
  ]);
  const out = await DM.agent.runTurn({ provider: p, diag: d, services: {} });
  assert.equal(result.risk_level, 3);
  assert.ok(result.precautions.length > 0);
  assert.equal(out.diag.messages[1].controlId, out.diag.controls[0].id, 'le message porte le contrôle proposé');
});

test('le message porte le contrôle visé par la question, même si plusieurs contrôles sont proposés', async () => {
  const d = userSays(newDiag(), 'go');
  const p = scriptedProvider([
    tools(toolUse('propose_control', { description: 'Mesurer l’intensité absorbée', type: 'sous_tension', why: 'a' }),
      toolUse('propose_control', { description: 'Contrôler la propreté du condenseur', type: 'visuel', why: 'b' })),
    (req) => {
      const first = JSON.parse(lastToolResults(req)[0].content).id;
      return tools(toolUse('ask_user', { question: 'Valeur mesurée ?', kind: 'result', control_id: first }));
    },
    text('Contrôle n°1…')
  ]);
  const out = await DM.agent.runTurn({ provider: p, diag: d, services: {} });
  const msg = out.diag.messages[out.diag.messages.length - 1];
  assert.equal(DM.findControl(out.diag, msg.controlId).description, 'Mesurer l’intensité absorbée');
});

test('reprise d’une conversation : historique et état renvoyés au modèle', async () => {
  let d = userSays(newDiag(), 'Le C20 déclenche.');
  const p1 = scriptedProvider([
    tools(toolUse('ask_user', { question: 'Au bout de combien de temps ?', kind: 'fact' })),
    text('Au bout de combien de temps ?')
  ]);
  d = (await DM.agent.runTurn({ provider: p1, diag: d, services: {} })).diag;
  // l'application est fermée puis rouverte : le diagnostic est relu depuis le stockage
  const store = DM.createStore(DM.memoryStorage());
  store.save(d);
  d = store.get(d.id);
  userSays(d, 'Environ cinq minutes.');
  const p2 = scriptedProvider([
    tools(toolUse('record_fact', { question: 'Délai avant déclenchement', answer: 'Environ 5 minutes' })),
    text('Noté.')
  ]);
  const out = await DM.agent.runTurn({ provider: p2, diag: d, services: {} });
  const msgs = p2.requests[0].messages;
  assert.equal(msgs[0].role, 'user');
  assert.equal(msgs[0].content, 'Le C20 déclenche.');
  assert.equal(msgs[1].role, 'assistant');
  assert.ok(msgs[1].content.includes('Au bout de combien de temps'));
  assert.ok(JSON.stringify(msgs[2].content).includes('Environ cinq minutes.'));
  assert.equal(out.diag.messages.length, 4);
  assert.equal(out.diag.facts[0].answer, 'Environ 5 minutes');
});

test('gestion d’une erreur API : l’erreur remonte, le message du technicien est conservé et rejouable', async () => {
  const d = userSays(newDiag(), 'Le C20 déclenche.');
  const failing = { name: 'fake', complete: async () => { throw DM.agent.AgentError('rate_limit', 'Limite de requêtes atteinte.', true); } };
  await assert.rejects(DM.agent.runTurn({ provider: failing, diag: d, services: {} }), (e) => e.code === 'rate_limit' && e.retryable === true);
  assert.equal(d.messages.length, 1, 'rien n’est perdu');
  // nouvel essai avec le même état
  const ok = scriptedProvider([text('Reçu.')]);
  const out = await DM.agent.runTurn({ provider: ok, diag: d, services: {} });
  assert.equal(out.reply, 'Reçu.');
  // deux messages utilisateur de suite (un premier envoi en échec) : regroupés pour l'API
  const d2 = userSays(userSays(newDiag(), 'Premier message'), 'Second message');
  const p = scriptedProvider([text('ok')]);
  await DM.agent.runTurn({ provider: p, diag: d2, services: {} });
  const roles = p.requests[0].messages.map(m => m.role);
  assert.deepEqual(roles, ['user']);
  assert.ok(JSON.stringify(p.requests[0].messages[0].content).includes('Premier message'));
});

test('arrêts particuliers : refus, pause, limite d’itérations, réponse tronquée', async () => {
  const d = userSays(newDiag(), 'x');
  const refused = await DM.agent.runTurn({ provider: scriptedProvider([{ content: [], stop_reason: 'refusal' }]), diag: d, services: {} });
  assert.match(refused.reply, /Reformule/);
  const paused = scriptedProvider([{ content: [{ type: 'server_tool_use', id: 'srv_1', name: 'web_search', input: { query: 'MUZ-LN35VG notice' } }], stop_reason: 'pause_turn' }, text('Suite.')]);
  const out = await DM.agent.runTurn({ provider: paused, diag: d, services: {} });
  assert.equal(out.reply, 'Suite.');
  assert.equal(paused.requests[1].messages.slice(-1)[0].role, 'assistant', 'le tour en pause est renvoyé tel quel');
  const loop = { name: 'loop', complete: async () => tools(toolUse('record_fact', { question: 'q', answer: 'r' })) };
  const capped = await DM.agent.runTurn({ provider: loop, diag: d, services: {}, maxIterations: 3 });
  assert.match(capped.reply, /limite/);
  await assert.rejects(DM.agent.runTurn({ provider: scriptedProvider([{ content: [{ type: 'text', text: 'coupé' }], stop_reason: 'max_tokens' }]), diag: d, services: {} }),
    (e) => e.code === 'truncated');
});

test('transparence : recherche Web, documentation, photo analysée, mesure enregistrée', async () => {
  const d = newDiag();
  d.photos.push({ id: 'pho_plaque01', kind: 'plaque' });
  userSays(d, 'Voici la plaque.', { attachments: [{ type: 'photo', id: 'pho_plaque01' }] });
  const docs = {
    search: async () => [{ id: 'doc_abc123', title: 'Notice MUZ-LN', manufacturer: 'Mitsubishi', model: 'MUZ-LN35VG', docType: 'notice' }],
    read: async (id) => ({ meta: { id, title: 'Notice MUZ-LN' }, block: { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0=' }, title: 'Notice MUZ-LN' } })
  };
  const p = scriptedProvider([
    (req) => {
      // la photo jointe est transmise au modèle
      const blocks = req.messages[req.messages.length - 1].content;
      assert.ok(blocks.some(b => b.type === 'image' && b.source.data === JPEG_1PX));
      return tools(
        toolUse('note_photo', { photo_id: 'pho_plaque01', observations: 'Plaque lisible : MUZ-LN35VG, 230 V', uncertain: 'Intensité max. partiellement masquée' }),
        toolUse('update_equipment', { model: 'MUZ-LN35VG', reference: 'MUZ-LN35VG', source: 'photo' }),
        toolUse('search_documentation', { manufacturer: 'Mitsubishi', model: 'MUZ-LN35VG' })
      );
    },
    tools(toolUse('read_document', { document_id: 'doc_abc123', focus: 'intensité maximale' })),
    (req) => {
      const last = req.messages[req.messages.length - 1].content;
      assert.equal(last[0].type, 'tool_result');
      assert.equal(last[last.length - 1].type, 'document', 'le document suit les résultats d’outils');
      return {
        content: [
          { type: 'server_tool_use', id: 'srv_1', name: 'web_search', input: { query: 'Mitsubishi MUZ-LN35VG intensité maximale' } },
          { type: 'web_search_tool_result', tool_use_id: 'srv_1', content: [{ type: 'web_search_result', title: 'Mitsubishi Electric — MUZ-LN35VG', url: 'https://www.mitsubishielectric.fr/muz-ln35vg' }] },
          { type: 'text', text: 'J’ai identifié le modèle MUZ-LN35VG.', citations: [{ type: 'web_search_result_location', url: 'https://www.mitsubishielectric.fr/muz-ln35vg', title: 'Mitsubishi Electric' }] }
        ],
        stop_reason: 'end_turn'
      };
    }
  ]);
  const out = await DM.agent.runTurn({ provider: p, diag: d, services: { documents: docs }, images: { pho_plaque01: { mediaType: 'image/jpeg', data: JPEG_1PX } } });
  const labels = out.trace.map(t => t.label);
  ['Photo analysée', 'Matériel identifié', 'Base documentaire consultée', 'Documentation consultée', 'Recherche Web effectuée'].forEach(l => assert.ok(labels.includes(l), l));
  const web = out.trace.find(t => t.kind === 'web');
  assert.equal(web.sources[0].url, 'https://www.mitsubishielectric.fr/muz-ln35vg');
  assert.equal(out.diag.reference, 'MUZ-LN35VG');
  assert.match(out.diag.photos[0].analysis.text, /Incertain/);
  assert.equal(out.diag.documents[0].id, 'doc_abc123');
});

test('scénario Mitsubishi complet avec une IA simulée (5 tours, jusqu’à la mesure 18,5 A)', async () => {
  let d = newDiag();
  const turns = [
    ['Ma clim Mitsubishi fait déclencher le C20 extérieur.', [
      tools(toolUse('update_equipment', { installation_type: 'hvac', brand: 'Mitsubishi', name: 'Clim Mitsubishi — C20 déclenche' }),
        toolUse('set_fault', { description: 'Le disjoncteur C20 de l’unité extérieure déclenche', symptoms_add: ['Déclenchement du C20 extérieur'] })),
      tools(toolUse('ask_user', { question: 'Depuis combien de temps fonctionne-t-elle avant le déclenchement ?', kind: 'fact' })),
      text('Depuis combien de temps fonctionne-t-elle avant le déclenchement ?')]],
    ['Environ cinq minutes.', [
      tools(toolUse('record_fact', { question: 'Durée de fonctionnement avant déclenchement', answer: 'Environ 5 minutes' }),
        toolUse('ask_user', { question: 'Le différentiel en amont déclenche-t-il également ?', choices: ['Oui', 'Non', 'Je ne sais pas'], kind: 'fact' })),
      text('Le différentiel en amont déclenche-t-il également ?')]],
    ['Non.', [
      tools(toolUse('record_fact', { question: 'Le différentiel en amont déclenche-t-il ?', answer: 'Non' }),
        toolUse('upsert_hypothesis', { cause: 'Surintensité de l’unité extérieure (compresseur / haute pression)', reason: 'C20 seul après plusieurs minutes', status: 'suspectee',
          evidence_add: ['Déclenche après ~5 min de fonctionnement', 'Le différentiel ne déclenche pas'] }),
        toolUse('upsert_hypothesis', { cause: 'Défaut d’isolement', reason: 'Déclenchement de protection', counter_evidence_add: ['Le différentiel ne déclenche pas'] }),
        toolUse('ask_user', { question: 'Peux-tu me donner la référence exacte de l’unité extérieure ou m’envoyer une photo de sa plaque ?', kind: 'fact' })),
      text('D’accord. Le déclenchement du C20 seul après plusieurs minutes rend intéressant le contrôle de la consommation. Peux-tu me donner la référence exacte de l’unité extérieure ou m’envoyer une photo de sa plaque ?')]],
    ['[photo plaque]', [
      tools(toolUse('note_photo', { photo_id: 'pho_plaque01', observations: 'Référence MUZ-LN35VG lisible' }),
        toolUse('update_equipment', { reference: 'MUZ-LN35VG', model: 'MUZ-LN35VG', source: 'photo' })),
      (req) => {
        const hyp = snapshotOf(req).match(/\[(hyp_[a-z0-9]+)\] Surintensité/)[1];
        return tools(toolUse('propose_control', { hypothesis_id: hyp, description: 'Mesurer l’intensité absorbée par l’unité extérieure pendant son fonctionnement', type: 'sous_tension',
          expected: 'Selon la plaque signalétique', why: 'Départager surintensité et autres causes', location: 'Alimentation unité extérieure' }),
        toolUse('ask_user', { question: 'Donne-moi la valeur mesurée.', kind: 'result' }));
      },
      text('J’ai identifié le modèle MUZ-LN35VG.\n**Contrôle n°1 :** mesurer l’intensité absorbée par l’unité extérieure.\n⚠️ RISQUE — mesure sous tension. Donne-moi la valeur mesurée et je poursuis le diagnostic.')]],
    ['18,5 A', [
      (req) => {
        const ctl = snapshotOf(req).match(/Contrôle \[(ctl_[a-z0-9]+)\]/)[1];
        const hyp = snapshotOf(req).match(/\[(hyp_[a-z0-9]+)\] Surintensité/)[1];
        return tools(toolUse('save_measurement', { kind: 'courant', label: 'Intensité absorbée unité extérieure', value: '18,5', unit: 'A', location: 'Unité extérieure', control_id: ctl }),
          toolUse('record_control_result', { control_id: ctl, obtained: '18,5 A', verdict: 'non_conforme', conclusion: 'Supérieure à l’intensité maximale de la plaque' }),
          toolUse('upsert_hypothesis', { id: hyp, evidence_add: ['Intensité mesurée 18,5 A, supérieure à la plaque'] }),
          toolUse('set_diagnosis_status', { status: 'probable', summary: 'Surintensité de l’unité extérieure', missing: ['Pression HP en fonctionnement', 'Intensité compresseur seul'] }));
      },
      text('18,5 A : c’est trop. Contrôle n°2 : …')]]
  ];
  for (const [msg, steps] of turns) {
    if (msg === '[photo plaque]') {
      d.photos.push({ id: 'pho_plaque01', kind: 'plaque' });
      userSays(d, '', { attachments: [{ type: 'photo', id: 'pho_plaque01' }] });
    } else userSays(d, msg);
    const out = await DM.agent.runTurn({ provider: scriptedProvider(steps), diag: d, services: { knowledge: kbService },
      images: { pho_plaque01: { mediaType: 'image/jpeg', data: JPEG_1PX } } });
    d = out.diag;
  }
  assert.equal(d.facts.length, 2);
  assert.equal(d.reference, 'MUZ-LN35VG');
  assert.equal(d.measurements[0].value, '18,5');
  assert.equal(d.measurements[0].location, 'Unité extérieure');
  assert.equal(d.verdict.status, 'probable');
  assert.deepEqual(d.verdict.missing, ['Pression HP en fonctionnement', 'Intensité compresseur seul']);
  const surint = d.hypotheses.find(h => /Surintensité/.test(h.cause));
  assert.equal(surint.status, 'suspectee');
  assert.equal(surint.evidence.length, 3);
  assert.equal(d.hypotheses.find(h => /isolement/.test(h.cause)).counterEvidence.length, 1);
  assert.equal(d.messages.length, 10);
  assert.equal(DM.riskLevel(d.controls[0], d.installationType).level, 3);
});

test('moteur local (hors ligne) : scénario Mitsubishi jusqu’au diagnostic confirmé', async () => {
  let d = newDiag();
  const said = [];
  // V2 : pas de confirmation sur une seule mesure ; le contrôle suivant de la piste est demandé d'abord
  for (const msg of ['Ma clim Mitsubishi fait déclencher le C20 extérieur.', 'Environ cinq minutes.', 'Non.', 'Non', 'Référence MUZ-LN35VG',
    '18,5 A', 'Non conforme', 'Condenseur très encrassé, ventilateur freiné', 'Non conforme', 'Oui, confirmer']) {
    userSays(d, msg);
    const out = await DM.agent.runLocalTurn({ diag: d, services: { knowledge: kbService } });
    d = out.diag;
    said.push(out.reply);
  }
  assert.match(said[0], /combien de temps/);
  assert.match(said[1], /différentiel/);
  assert.match(said[4], /Contrôle n°1/);
  assert.match(said[4], /RISQUE/);
  assert.match(said[5], /18,5 A/);
  assert.match(said[6], /suspectée/);
  assert.match(said[6], /Contrôle n°2/, 'contrôle complémentaire avant toute confirmation');
  assert.doesNotMatch(said[6], /je la confirme/);
  assert.match(said[8], /je la confirme/);
  assert.match(said[9], /Diagnostic confirmé/);
  assert.equal(d.verdict.status, 'confirme');
  assert.equal(d.brand, 'Mitsubishi');
  assert.equal(d.reference, 'MUZ-LN35VG');
  // aucune question factuelle n'a été posée deux fois (les demandes de résultat reviennent, une par contrôle)
  const asked = d.messages.filter(m => m.ask && m.ask.kind === 'fact').map(m => m.ask.question);
  assert.ok(asked.length >= 3);
  assert.equal(new Set(asked).size, asked.length);
  const resultAsks = d.messages.filter(m => m.ask && m.ask.kind === 'result').map(m => m.ask.controlId);
  assert.equal(new Set(resultAsks).size, resultAsks.length, 'jamais deux demandes de résultat pour le même contrôle');
});

test('moteur local : convoyeur qui disjoncte par intermittence → pôle de KM3 dégradé', async () => {
  // les mesures ne sont données que si l'application les demande
  function answer(ask, d) {
    const q = DM.normalize(ask.question || '');
    const cd = ask.controlId ? DM.normalize(DM.findControl(d, ask.controlId).description) : '';
    if (ask.kind === 'confirm') return 'Oui, confirmer';
    if (/plaque moteur/.test(q)) return 'Moteur 400 V, 11 kW, 21 A, étoile-triangle (KM1, KM2, KM3), relais thermique F2 réglé à 12,5 A dans le triangle.';
    if (/intensite sur chaque phase/.test(cd)) return 'Après 40 min : L1 : 20,1 A · L2 : 20,6 A · L3 : 26,4 A';
    if (/thermographie/.test(cd)) return 'Un pôle de KM3 à 87 °C, les autres à environ 45 °C';
    if (/chute de tension/.test(cd)) return 'KM3 en charge : 0,08 V · 0,09 V · 3,7 V';
    throw new Error('Question inattendue : ' + ask.question + ' / ' + cd);
  }
  let d = newDiag();
  let msg = 'Convoyeur à bande, ligne n°2 : le moteur disjoncte par intermittence, surtout l’après-midi. Le voyant défaut thermique s’allume. ' +
    'On réarme, ça repart, puis ça recommence 30 à 50 minutes plus tard. Roulements remplacés il y a 3 semaines, bande retendue il y a 2 mois. Atelier à 32 °C.';
  const asked = [];
  for (let i = 0; i < 8; i++) {
    userSays(d, msg);
    const out = await DM.agent.runLocalTurn({ diag: d, services: {} });
    d = out.diag;
    if (d.verdict.status === 'confirme') break;
    asked.push(out.ask.question);
    msg = answer(out.ask, d);
  }
  // questions pertinentes seulement : ni délai (déjà donné), ni différentiel (défaut thermique), ni code défaut
  assert.ok(!asked.some(q => /combien de temps|différentiel|code défaut/.test(q)), asked.join(' | '));
  assert.equal(d.verdict.status, 'confirme');
  assert.match(d.verdict.summary, /Contact de contacteur dégradé.*KM3/);
  // confirmation seulement après le contrôle de chute de tension (pas sur la seule thermographie)
  assert.ok(d.controls.some(c => /chute de tension/.test(c.description) && c.verdict === 'non_conforme'));
  const surcharge = d.hypotheses.find(h => /Surcharge/.test(h.cause));
  assert.ok(surcharge.counterEvidence.length >= 1, 'le déséquilibre contredit la surcharge mécanique');
  assert.equal(d.measurements.filter(m => m.unit === 'A').map(m => m.label.slice(0, 2)).join(','), 'L1,L2,L3');
  const series = DM.agent.analyzeSeries(DM.agent.parseMeasurements('L1 : 20,1 A · L2 : 20,6 A · L3 : 26,4 A'));
  assert.equal(series.abnormal, true);
  assert.equal(series.outlier.label, 'L3');
  assert.equal(DM.agent.analyzeSeries(DM.agent.parseMeasurements('13,1 A / 13,4 A / 13,2 A')).abnormal, false);
});

test('moteur local : « je ne sais pas » et piste écartée par un résultat conforme', async () => {
  let d = newDiag();
  for (const msg of ['Le moteur du convoyeur chauffe', 'Je ne sais pas', 'Je ne sais pas']) {
    userSays(d, msg);
    d = (await DM.agent.runLocalTurn({ diag: d, services: {} })).diag;
  }
  assert.ok(d.facts.some(f => /Inconnu/.test(f.answer)));
  const next = DM.nextControl(d);
  assert.ok(next, 'un contrôle est proposé malgré les inconnues');
  userSays(d, 'Conforme');
  d = (await DM.agent.runLocalTurn({ diag: d, services: {} })).diag;
  const h = DM.findHyp(d, next.hypothesisId);
  assert.ok(h.counterEvidence.length >= 1);
});
