'use strict';
/**
 * Interface commune des fournisseurs d'IA.
 *
 * complete({ system, messages, tools, context }) → Promise<{ content, stop_reason, usage, model }>
 *   - messages / content : blocs au format Messages API d'Anthropic (format pivot de l'application) ;
 *     un fournisseur tiers traduit depuis/vers ce format.
 *   - erreurs : lever DM.agent.AgentError(code, message, retryable) avec un code stable :
 *     auth, permission, rate_limit, overloaded, network, timeout, bad_request, model_not_found,
 *     not_configured, not_implemented, upstream.
 */
class AIProvider {
  constructor(name) { this.name = name; }
  /** Le fournisseur est-il utilisable (identifiants présents…) ? */
  get available() { return true; }
  /** Nom d'outil pris en charge (les outils serveur Web ne concernent que certains fournisseurs). */
  supportsTool() { return true; }
  /** Informations affichables (jamais de secret). */
  describe() { return { name: this.name, available: this.available }; }
  // eslint-disable-next-line no-unused-vars
  async complete(request) { throw new Error('complete() non implémenté pour ' + this.name); }
}

module.exports = { AIProvider };
