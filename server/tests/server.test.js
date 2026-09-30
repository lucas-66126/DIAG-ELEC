'use strict';
/* Serveur HTTP de bout en bout : santé, jeton, CORS, tour d'agent, photos, documents, connaissances, erreurs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { DM, tmpDir, JPEG_1PX, PDF_MIN, scriptedProvider, toolUse, tools, text } = require('./helpers');
const { createServer } = require('../src/http');
const { loadConfig } = require('../src/config');
const { createProviderFactory } = require('../src/providers');
const { DocumentStore } = require('../src/services/documents');
const { KnowledgeStore } = require('../src/services/knowledge');
const { ImageStore } = require('../src/services/images');

async function start(env, providerOverride) {
  const dataDir = tmpDir();
  const config = loadConfig(Object.assign({ DATA_DIR: dataDir }, env || {}));
  let providers = createProviderFactory(config);
  if (providerOverride) {
    providers = { name: 'fake', describe: () => ({ name: 'fake', available: true }), create: providerOverride };
  }
  const deps = { config, providers, documents: new DocumentStore(dataDir, config), knowledge: new KnowledgeStore(dataDir), images: new ImageStore(dataDir, config) };
  const server = createServer(deps);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  return {
    base, deps, dataDir,
    req: async (path, opts) => {
      opts = opts || {};
      const res = await fetch(base + path, {
        method: opts.method || (opts.body ? 'POST' : 'GET'),
        headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}),
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
      const ct = res.headers.get('content-type') || '';
      return { status: res.status, headers: res.headers, json: ct.includes('json') ? await res.json() : null, raw: ct.includes('json') ? null : Buffer.from(await res.arrayBuffer()) };
    },
    close: () => new Promise(r => { server.close(r); fs.rmSync(dataDir, { recursive: true, force: true }); })
  };
}

function diagWith(text, extra) {
  const d = DM.createDraft({});
  DM.addMessage(d, Object.assign({ role: 'user', text }, extra || {}));
  return d;
}

test('santé : fournisseur décrit sans secret', async () => {
  const s = await start({ ANTHROPIC_API_KEY: 'sk-ant-secret' });
  const r = await s.req('/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.json.provider.name, 'anthropic');
  assert.equal(r.json.provider.model, 'claude-opus-5-5');
  assert.ok(!JSON.stringify(r.json).includes('sk-ant-secret'));
  await s.close();
});

test('jeton d’accès obligatoire quand il est configuré', async () => {
  const s = await start({ APP_ACCESS_TOKEN: 'jeton-123' });
  assert.equal((await s.req('/api/health')).json.auth.required, true);
  const no = await s.req('/api/documents');
  assert.equal(no.status, 401);
  assert.equal(no.json.error.code, 'unauthorized');
  assert.equal((await s.req('/api/documents', { headers: { 'X-App-Token': 'mauvais' } })).status, 401);
  assert.equal((await s.req('/api/documents', { headers: { 'X-App-Token': 'jeton-123' } })).status, 200);
  await s.close();
});

test('CORS : origine autorisée acceptée, origine inconnue refusée', async () => {
  const s = await start({ ALLOWED_ORIGINS: 'https://lucas-66126.github.io' });
  const ok = await s.req('/api/health', { headers: { Origin: 'https://lucas-66126.github.io' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://lucas-66126.github.io');
  const ko = await s.req('/api/health', { headers: { Origin: 'https://site-malveillant.example' } });
  assert.equal(ko.status, 403);
  await s.close();
});

test('tour d’agent (moteur local, sans clé) via l’API', async () => {
  const s = await start({});
  const r = await s.req('/api/agent/turn', { body: { diag: diagWith('Ma clim Mitsubishi fait déclencher le C20 extérieur.') } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.engine, 'local');
  assert.match(r.json.reply, /combien de temps/);
  assert.equal(r.json.diag.brand, 'Mitsubishi');
  assert.equal(r.json.diag.messages.length, 2);
  await s.close();
});

test('ajout d’une photo : copiée sur le serveur, transmise au modèle, réexaminable', async () => {
  let seen = null;
  const provider = () => scriptedProvider([
    (req) => { seen = req.messages[req.messages.length - 1].content.find(b => b.type === 'image'); return tools(toolUse('analyze_image', { photo_id: 'pho_plaque01', focus: 'référence' })); },
    (req) => {
      const res = req.messages[req.messages.length - 1].content[0];
      assert.ok(Array.isArray(res.content) && res.content.some(b => b.type === 'image'), 'photo réaffichée depuis le stockage serveur');
      return text('Plaque lue.');
    }
  ]);
  const s = await start({}, provider);
  const d = diagWith('Voici la plaque', { attachments: [{ type: 'photo', id: 'pho_plaque01' }] });
  d.photos.push({ id: 'pho_plaque01', kind: 'plaque' });
  const r = await s.req('/api/agent/turn', { body: { diag: d, images: { pho_plaque01: { mediaType: 'image/jpeg', data: JPEG_1PX } } } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(seen.source.data, JPEG_1PX);
  assert.ok(await s.deps.images.get(d.id, 'pho_plaque01'));
  // identifiants invalides (tentative de sortie du dossier) refusés
  const bad = await s.req('/api/agent/turn', { body: { diag: d, images: { '../../x': { mediaType: 'image/jpeg', data: JPEG_1PX } } } });
  assert.equal(bad.status, 400);
  await s.close();
});

test('gestion d’une erreur API : code HTTP et message explicites', async () => {
  const cases = [['rate_limit', 429], ['auth', 502], ['overloaded', 503], ['network', 504], ['not_configured', 503]];
  for (const [code, status] of cases) {
    const s = await start({}, () => ({ name: 'x', complete: async () => { throw DM.agent.AgentError(code, 'Message ' + code, code !== 'auth'); } }));
    const r = await s.req('/api/agent/turn', { body: { diag: diagWith('x') } });
    assert.equal(r.status, status, code);
    assert.equal(r.json.error.code, code);
    assert.equal(r.json.error.retryable, code !== 'auth');
    await s.close();
  }
  // sans clé mais fournisseur anthropic forcé → 503 not_configured
  const s = await start({ AI_PROVIDER: 'anthropic' });
  const r = await s.req('/api/agent/turn', { body: { diag: diagWith('x') } });
  assert.equal(r.status, 503);
  assert.equal(r.json.error.code, 'not_configured');
  // requêtes invalides
  assert.equal((await s.req('/api/agent/turn', { body: { pas: 'de diag' } })).status, 400);
  const d = DM.createDraft({});
  assert.equal((await s.req('/api/agent/turn', { body: { diag: d } })).json.error.code, 'no_user_message');
  await s.close();
});

test('base documentaire : ajout, recherche par fabricant/modèle, lecture par l’agent, suppression', async () => {
  const s = await start({});
  const up = await s.req('/api/documents', { body: { mediaType: 'application/pdf', data: PDF_MIN,
    meta: { title: 'Notice installation MUZ-LN', manufacturer: 'Mitsubishi Electric', category: 'Climatisation', series: 'LN', model: 'MUZ-LN35VG', reference: 'MUZ-LN35VG', docType: 'notice' } } });
  assert.equal(up.status, 201, JSON.stringify(up.json));
  const id = up.json.document.id;
  assert.equal((await s.req('/api/documents', { body: { mediaType: 'application/pdf', data: Buffer.from('pas un pdf').toString('base64'), meta: {} } })).status, 400);
  assert.equal((await s.req('/api/documents', { body: { mediaType: 'application/zip', data: 'UEs=', meta: {} } })).status, 415);
  const found = await s.req('/api/documents?manufacturer=mitsubishi&model=muz-ln35vg');
  assert.equal(found.json.documents[0].id, id);
  assert.ok(found.json.tree['Mitsubishi Electric']['Climatisation']['LN']['MUZ-LN35VG']);
  assert.equal((await s.req('/api/documents?model=PUHZ-ZRP71')).json.documents.length, 0);
  const file = await s.req('/api/documents/' + id + '/file');
  assert.equal(file.headers.get('content-type'), 'application/pdf');
  assert.equal(file.raw.slice(0, 5).toString(), '%PDF-');
  const read = s.deps.documents.read(id);
  assert.equal(read.block.type, 'document');
  assert.equal(read.block.source.media_type, 'application/pdf');
  assert.equal((await s.req('/api/documents/' + id, { method: 'DELETE' })).status, 200);
  assert.equal((await s.req('/api/documents')).json.documents.length, 0);
  await s.close();
});

test('base de connaissances : synchronisation des diagnostics terminés puis recherche', async () => {
  const s = await start({});
  const d = DM.createDiagnostic({ name: 'Clim salle 3', installationType: 'hvac', brand: 'Mitsubishi', reference: 'MUZ-LN35VG', description: 'Le C20 déclenche après 5 minutes' });
  const h = DM.addHypothesis(d, { cause: 'Compresseur en surintensité' });
  const c = DM.addControl(d, { hypothesisId: h.id, type: 'visuel', description: 'x' });
  DM.recordResult(d, c.id, { obtained: 'y', verdict: 'non_conforme' });
  DM.concludeHypothesis(d, h.id, 'confirmee', '');
  DM.closeDiagnostic(d, { finalDiagnosis: 'Compresseur', repair: 'Remplacement compresseur' });
  const sync = await s.req('/api/knowledge', { body: { diagnostics: [d, { invalide: true }] } });
  assert.equal(sync.json.accepted, 1);
  const again = await s.req('/api/knowledge', { body: { diagnostics: [d] } }); // idempotent
  assert.equal(again.json.accepted, 1);
  assert.equal(s.deps.knowledge.all().length, 1);
  const r = await s.req('/api/knowledge/search?mode=reference&reference=MUZ-LN35VG');
  assert.equal(r.json.results[0].entry.cause, 'Compresseur en surintensité');
  await s.close();
});

test('fichiers statiques : application servie, code serveur et fichiers cachés jamais exposés', async () => {
  const s = await start({});
  const home = await s.req('/');
  assert.equal(home.status, 200);
  assert.ok(home.raw.toString().includes('DIAG-MAINT'));
  for (const p of ['/server/src/config.js', '/server/.env.example', '/.gitignore', '/%2e%2e/%2e%2e/Windows/win.ini']) {
    assert.equal((await s.req(p)).status, 404, p);
  }
  await s.close();
});
