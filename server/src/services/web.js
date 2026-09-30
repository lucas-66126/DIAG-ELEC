'use strict';
/**
 * Recherche Web — architecture.
 *
 * Avec AnthropicProvider, la recherche est faite par les outils serveur d'Anthropic
 * (web_search / web_fetch) : exécutés chez Anthropic, résultats et sources renvoyés dans la réponse,
 * affichés dans l'interface (« Recherche Web effectuée » + liens). Rien à exécuter ici.
 *
 * Pour un autre fournisseur (OpenAI, modèle local), brancher ici un service de recherche
 * (API d'un moteur de recherche) et l'exposer comme outil client « search_web » :
 *   search(query, { preferDomains }) → [{ title, url, snippet }]
 * Règles à conserver : privilégier les sites constructeurs et les notices officielles,
 * citer les sources, présenter une source douteuse comme « à vérifier ».
 */
class WebSearchService {
  get available() { return false; }
  // eslint-disable-next-line no-unused-vars
  async search(query, opts) { throw new Error('Recherche Web non configurée pour ce fournisseur.'); }
}

/** Domaines constructeurs à privilégier (indication donnée à l'agent / au futur service). */
const PREFERRED_DOMAINS = [
  'mitsubishielectric.fr', 'mitsubishi-les.com', 'daikin.fr', 'toshiba-aircon.fr', 'atlantic.fr', 'carrier.com',
  'se.com', 'legrand.fr', 'hager.fr', 'abb.com', 'siemens.com', 'grundfos.com', 'wilo.com', 'danfoss.com',
  'sew-eurodrive.fr', 'leroy-somer.com', 'omron.fr', 'rockwellautomation.com'
];

module.exports = { WebSearchService, PREFERRED_DOMAINS };
