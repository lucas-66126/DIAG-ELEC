'use strict';
/**
 * AnthropicProvider — Claude via le SDK officiel @anthropic-ai/sdk.
 *
 * - Identifiants : résolus par le SDK depuis l'environnement (ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN…).
 * - Modèle : ANTHROPIC_MODEL (défaut claude-opus-5-5), effort : ANTHROPIC_EFFORT (défaut medium).
 * - Réflexion adaptative ; repli automatique en cas de refus (fallbacks: "default").
 * - Recherche Web : outils serveur Anthropic web_search / web_fetch (exécutés chez Anthropic, sources citées).
 */
const AnthropicSDK = require('@anthropic-ai/sdk');
const DM = require('../core');
const { AIProvider } = require('./AIProvider');

const Anthropic = AnthropicSDK.default || AnthropicSDK;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/** Convertit une erreur du SDK en AgentError (code stable + message en français). */
function mapError(err) {
  const E = DM.agent.AgentError;
  if (err && err.name === 'AgentError') return err;
  if (err instanceof Anthropic.AuthenticationError) return E('auth', 'Clé d’API Anthropic invalide ou absente (configuration du serveur).', false);
  if (err instanceof Anthropic.PermissionDeniedError) return E('permission', 'Accès refusé par l’API Anthropic (droits du compte ou de la clé).', false);
  if (err instanceof Anthropic.NotFoundError) return E('model_not_found', 'Modèle ou ressource introuvable : vérifier ANTHROPIC_MODEL.', false);
  if (err instanceof Anthropic.RateLimitError) return E('rate_limit', 'Limite de requêtes atteinte. Réessaie dans un instant.', true);
  if (err instanceof Anthropic.BadRequestError) return E('bad_request', 'Requête refusée par l’API : ' + (err.message || '').slice(0, 300), false);
  if (err instanceof Anthropic.APIConnectionTimeoutError) return E('timeout', 'Le service d’IA ne répond pas (délai dépassé).', true);
  if (err instanceof Anthropic.APIConnectionError) return E('network', 'Connexion au service d’IA impossible.', true);
  if (err instanceof Anthropic.InternalServerError || (err instanceof Anthropic.APIError && err.status >= 500)) {
    return E(err.status === 529 ? 'overloaded' : 'upstream', err.status === 529 ? 'Service d’IA surchargé. Réessaie dans un instant.' : 'Erreur du service d’IA (' + err.status + ').', true);
  }
  if (err instanceof Anthropic.APIError) return E('upstream', 'Erreur de l’API (' + (err.status || '?') + ').', !!(err.status >= 500));
  return E('internal', 'Erreur interne : ' + (err && err.message ? err.message : String(err)), false);
}

class AnthropicProvider extends AIProvider {
  /**
   * @param {object} cfg config.anthropic
   * @param {object} [client] client injecté (tests)
   */
  constructor(cfg, client) {
    super('anthropic');
    this.cfg = cfg;
    this.client = client || null;
  }
  get available() { return !!(this.client || this.cfg.hasCredentials); }
  getClient() {
    if (!this.client) this.client = new Anthropic(); // identifiants lus dans l'environnement par le SDK
    return this.client;
  }
  describe() {
    return { name: 'anthropic', available: this.available, model: this.cfg.model, effort: this.cfg.effort, webSearch: this.cfg.webSearch };
  }
  serverTools() {
    if (!this.cfg.webSearch) return [];
    return [
      { type: this.cfg.webSearchTool, name: 'web_search', max_uses: this.cfg.webSearchMaxUses },
      { type: this.cfg.webFetchTool, name: 'web_fetch', max_uses: 3 }
    ];
  }

  async complete(req) {
    const params = {
      model: this.cfg.model,
      max_tokens: this.cfg.maxTokens,
      // prompt système stable → mis en cache
      system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
      messages: req.messages,
      tools: req.tools.concat(this.serverTools()),
      thinking: { type: 'adaptive' },
      output_config: { effort: this.cfg.effort }
    };
    let res;
    try {
      const client = this.getClient();
      if (this.cfg.fallbacks) {
        res = await client.beta.messages.create(Object.assign({}, params, { betas: [FALLBACK_BETA], fallbacks: 'default' }));
      } else {
        res = await client.messages.create(params);
      }
    } catch (err) {
      throw mapError(err);
    }
    return { content: res.content || [], stop_reason: res.stop_reason, usage: res.usage || {}, model: res.model };
  }
}

module.exports = { AnthropicProvider, mapError };
