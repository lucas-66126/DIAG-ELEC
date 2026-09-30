'use strict';
/**
 * Charge dans Node le cœur partagé avec le navigateur (js/*.js).
 * Ces fichiers sont des scripts sans dépendance qui s'enregistrent sur window.DM :
 * on expose `window` comme alias de l'objet global le temps du chargement.
 */
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const FILES = [
  'js/utils.js', 'js/safety.js', 'js/knowledge.js', 'js/model.js', 'js/report.js', 'js/kb.js',
  'js/agent/tools.js', 'js/agent/engine.js', 'js/agent/local-provider.js'
];

if (!global.DM) {
  if (!global.window) global.window = global;
  FILES.forEach(function (f) { require(path.join(ROOT, f)); });
}

module.exports = global.DM;
module.exports.ROOT = ROOT;
