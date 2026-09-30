'use strict';
/**
 * Fabrique de fournisseurs d'IA. Le fournisseur local est à état (un par tour) ; les autres sont réutilisés.
 */
const DM = require('../core');
const { AnthropicProvider } = require('./anthropic');
const { OpenAIProvider } = require('./openai');

function createProviderFactory(config, overrides) {
  overrides = overrides || {};
  const name = overrides.provider || config.provider;
  let shared = null;
  if (name === 'anthropic') shared = overrides.instance || new AnthropicProvider(config.anthropic, overrides.client);
  else if (name === 'openai') shared = overrides.instance || new OpenAIProvider(config.openai);

  return {
    name: name,
    describe: function () {
      if (name === 'local') return { name: 'local', available: true, note: 'Moteur à règles, sans IA' };
      return shared.describe();
    },
    /** Fournisseur pour un tour d'agent. */
    create: function () {
      if (name === 'local') return new DM.agent.LocalProvider();
      if (!shared.available) {
        throw DM.agent.AgentError('not_configured', 'Aucune clé d’API configurée sur le serveur pour « ' + name + ' ».', false);
      }
      return shared;
    }
  };
}

module.exports = { createProviderFactory };
