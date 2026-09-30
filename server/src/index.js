'use strict';
/**
 * DIAG-MAINT V2 — point d'entrée du serveur.
 *   npm start            (depuis le dossier server/)
 * Configuration : variables d'environnement ou fichier server/.env (voir .env.example).
 */
const path = require('path');
const { loadConfig, loadEnvFile } = require('./config');

loadEnvFile(path.join(__dirname, '..', '.env'));
const config = loadConfig();

const { createServer, VERSION } = require('./http');
const { createProviderFactory } = require('./providers');
const { DocumentStore } = require('./services/documents');
const { KnowledgeStore } = require('./services/knowledge');
const { ImageStore } = require('./services/images');

const loopback = ['127.0.0.1', 'localhost', '::1'].indexOf(config.host) !== -1;
if (!loopback && !config.accessToken) {
  console.error('Refus de démarrer : le serveur écoute sur ' + config.host + ' (réseau) sans APP_ACCESS_TOKEN.\n' +
    'Définis APP_ACCESS_TOKEN dans server/.env pour éviter que n’importe qui utilise ta clé d’API.');
  process.exit(1);
}

const deps = {
  config: config,
  providers: createProviderFactory(config),
  documents: new DocumentStore(config.dataDir, config),
  knowledge: new KnowledgeStore(config.dataDir),
  images: new ImageStore(config.dataDir, config)
};

const server = createServer(deps);
server.listen(config.port, config.host, function () {
  const p = deps.providers.describe();
  console.log('');
  console.log('  DIAG-MAINT V' + VERSION + ' — http://' + (loopback ? 'localhost' : config.host) + ':' + config.port + '/');
  console.log('  Fournisseur IA : ' + p.name + (p.model ? ' (' + p.model + ', effort ' + p.effort + ')' : '') +
    (p.available === false ? ' — NON CONFIGURÉ (clé manquante)' : '') + (p.webSearch ? ' + recherche Web' : ''));
  if (p.name === 'local') console.log('  Aucune clé d’API : moteur local sans IA. Voir server/.env.example.');
  console.log('  Données : ' + config.dataDir);
  console.log('  Ctrl+C pour arrêter.');
  console.log('');
});
