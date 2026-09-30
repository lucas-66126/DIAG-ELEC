'use strict';
/* AnthropicProvider : forme des requêtes et conversion des erreurs du SDK (client simulé, aucun appel réseau). */
const test = require('node:test');
const assert = require('node:assert/strict');
const AnthropicSDK = require('@anthropic-ai/sdk');
const { AnthropicProvider, mapError } = require('../src/providers/anthropic');
const { loadConfig } = require('../src/config');
const { DM } = require('./helpers');

const Anthropic = AnthropicSDK.default || AnthropicSDK;

function fakeClient(impl) {
  const calls = { beta: [], std: [] };
  return {
    calls,
    beta: { messages: { create: async (p) => { calls.beta.push(p); return impl(p); } } },
    messages: { create: async (p) => { calls.std.push(p); return impl(p); } }
  };
}
const OK = () => ({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, model: 'claude-opus-5-5' });

test('configuration : modèle et effort par variables d’environnement, fournisseur auto', () => {
  const c1 = loadConfig({});
  assert.equal(c1.provider, 'local', 'sans clé → moteur local');
  assert.equal(c1.anthropic.model, 'claude-opus-5-5');
  const c2 = loadConfig({ ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_MODEL: 'claude-sonnet-5-5', ANTHROPIC_EFFORT: 'low', WEB_SEARCH: 'false' });
  assert.equal(c2.provider, 'anthropic');
  assert.equal(c2.anthropic.model, 'claude-sonnet-5-5');
  assert.equal(c2.anthropic.effort, 'low');
  assert.equal(c2.anthropic.webSearch, false);
});

test('requête : prompt système en cache, réflexion adaptative, effort, recherche Web, repli en cas de refus', async () => {
  const cfg = loadConfig({ ANTHROPIC_API_KEY: 'sk-test' }).anthropic;
  const client = fakeClient(OK);
  const p = new AnthropicProvider(cfg, client);
  const tools = DM.agent.toolDefs(['ask_user', 'record_fact']);
  const out = await p.complete({ system: 'PROMPT', messages: [{ role: 'user', content: 'x' }], tools });
  assert.equal(out.stop_reason, 'end_turn');
  const req = client.calls.beta[0];
  assert.equal(req.model, 'claude-opus-5-5');
  assert.deepEqual(req.system, [{ type: 'text', text: 'PROMPT', cache_control: { type: 'ephemeral' } }]);
  assert.deepEqual(req.thinking, { type: 'adaptive' });
  assert.deepEqual(req.output_config, { effort: 'medium' });
  assert.deepEqual(req.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(req.fallbacks, 'default');
  assert.deepEqual(req.tools.map(t => t.name), ['ask_user', 'record_fact', 'web_search', 'web_fetch']);
  assert.equal(req.tools[2].type, 'web_search_20260209');
  assert.ok(!('budget_tokens' in req.thinking));

  const cfg2 = loadConfig({ ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_FALLBACKS: 'off', WEB_SEARCH: 'false' }).anthropic;
  const client2 = fakeClient(OK);
  await new AnthropicProvider(cfg2, client2).complete({ system: 'P', messages: [], tools: [] });
  assert.equal(client2.calls.std.length, 1, 'sans repli : endpoint standard');
  assert.deepEqual(client2.calls.std[0].tools, []);
});

test('disponibilité : sans identifiants, le fournisseur n’est pas utilisable', () => {
  const p = new AnthropicProvider(loadConfig({}).anthropic);
  assert.equal(p.available, false);
  assert.equal(p.describe().model, 'claude-opus-5-5');
  assert.ok(!JSON.stringify(p.describe()).includes('sk-'), 'aucun secret exposé');
});

function sdkError(Cls, status, type) {
  return new Cls(status, { type: 'error', error: { type: type, message: type } }, type, new Headers());
}

test('gestion des erreurs API : chaque erreur du SDK devient un code stable', async () => {
  const cases = [
    [sdkError(Anthropic.AuthenticationError, 401, 'authentication_error'), 'auth', false],
    [sdkError(Anthropic.PermissionDeniedError, 403, 'permission_error'), 'permission', false],
    [sdkError(Anthropic.NotFoundError, 404, 'not_found_error'), 'model_not_found', false],
    [sdkError(Anthropic.RateLimitError, 429, 'rate_limit_error'), 'rate_limit', true],
    [sdkError(Anthropic.BadRequestError, 400, 'invalid_request_error'), 'bad_request', false],
    [sdkError(Anthropic.InternalServerError, 529, 'overloaded_error'), 'overloaded', true],
    [sdkError(Anthropic.InternalServerError, 500, 'api_error'), 'upstream', true],
    [new Anthropic.APIConnectionError({ message: 'ECONNRESET' }), 'network', true],
    [new Anthropic.APIConnectionTimeoutError({ message: 'timeout' }), 'timeout', true]
  ];
  for (const [err, code, retryable] of cases) {
    const p = new AnthropicProvider(loadConfig({ ANTHROPIC_API_KEY: 'k' }).anthropic, fakeClient(() => { throw err; }));
    await assert.rejects(p.complete({ system: '', messages: [], tools: [] }), (e) => {
      assert.equal(e.code, code, err.constructor.name);
      assert.equal(e.retryable, retryable, err.constructor.name);
      assert.ok(e.message.length > 5);
      return true;
    });
  }
  assert.equal(mapError(new Error('boom')).code, 'internal');
});

test('erreur API pendant un tour d’agent : propagée avec son code', async () => {
  const d = DM.createDraft();
  DM.addMessage(d, { role: 'user', text: 'Le C20 déclenche' });
  const p = new AnthropicProvider(loadConfig({ ANTHROPIC_API_KEY: 'k' }).anthropic, fakeClient(() => { throw sdkError(Anthropic.RateLimitError, 429, 'rate_limit_error'); }));
  await assert.rejects(DM.agent.runTurn({ provider: p, diag: d, system: 'x', services: {} }), (e) => e.code === 'rate_limit');
});
