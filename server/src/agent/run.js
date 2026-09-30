'use strict';
/**
 * Exécution d'un tour d'agent côté serveur : validation de la requête, copie des photos,
 * services (documents, connaissances, images), fournisseur d'IA, boucle partagée.
 */
const DM = require('../core');
const { SYSTEM_PROMPT } = require('./system-prompt');

const MAX_PHOTOS_PER_TURN = 6;

/**
 * @param {object} deps { providers, documents, knowledge, images, config }
 * @param {object} body { diag, images: {photoId: {mediaType, data}}, knowledge: [fiches locales] }
 */
async function runAgentTurn(deps, body) {
  if (!body || typeof body !== 'object' || !body.diag || typeof body.diag !== 'object') {
    throw Object.assign(DM.agent.AgentError('bad_request', 'Requête invalide : diagnostic manquant.', false), { status: 400 });
  }
  const diag = DM.normalizeDiag(body.diag);
  if (!Array.isArray(diag.messages) || !diag.messages.length || diag.messages[diag.messages.length - 1].role !== 'user') {
    throw Object.assign(DM.agent.AgentError('no_user_message', 'Aucun message du technicien à traiter.', false), { status: 400 });
  }

  // photos jointes au message courant : copie serveur (réexamen ultérieur) + envoi au modèle
  const images = {};
  const incoming = body.images && typeof body.images === 'object' ? body.images : {};
  Object.keys(incoming).slice(0, MAX_PHOTOS_PER_TURN).forEach(function (photoId) {
    const img = incoming[photoId];
    if (!img || typeof img.data !== 'string') return;
    deps.images.save(diag.id, photoId, img.mediaType || 'image/jpeg', img.data);
    images[photoId] = { mediaType: img.mediaType || 'image/jpeg', data: img.data };
  });

  const provider = deps.providers.create();
  const services = {
    knowledge: deps.knowledge.service(body.knowledge),
    documents: {
      search: async function (q) { return deps.documents.search(q); },
      read: async function (id) { return deps.documents.read(id); }
    },
    images: deps.images
  };
  const out = await DM.agent.runTurn({
    provider: provider,
    diag: diag,
    system: SYSTEM_PROMPT,
    services: services,
    images: images,
    maxIterations: deps.config.maxIterations
  });
  return {
    diag: out.diag,
    reply: out.reply,
    ask: out.ask,
    trace: out.trace,
    suggestReport: out.suggestReport,
    engine: out.engine,
    model: provider.cfg ? provider.cfg.model : provider.name,
    usage: out.usage,
    iterations: out.iterations
  };
}

module.exports = { runAgentTurn };
