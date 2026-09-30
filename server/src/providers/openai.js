'use strict';
/**
 * OpenAIProvider — squelette (non connecté en V2).
 *
 * Pour le brancher : traduire le format pivot (blocs Messages API d'Anthropic : text, image,
 * document, tool_use, tool_result) vers l'API du fournisseur, puis traduire la réponse en retour
 * ({content, stop_reason: 'tool_use'|'end_turn'|'max_tokens', usage}). La boucle d'agent, les outils
 * et les règles métier n'ont pas à changer. La recherche Web devra passer par un service
 * (server/src/services/web.js) exposé comme outil client.
 */
const DM = require('../core');
const { AIProvider } = require('./AIProvider');

class OpenAIProvider extends AIProvider {
  constructor(cfg) { super('openai'); this.cfg = cfg || {}; }
  get available() { return false; }
  describe() { return { name: 'openai', available: false, note: 'Non implémenté en V2' }; }
  async complete() {
    throw DM.agent.AgentError('not_implemented', 'Le fournisseur OpenAI n’est pas encore connecté (V2). Utilise AI_PROVIDER=anthropic ou local.', false);
  }
}

module.exports = { OpenAIProvider };
