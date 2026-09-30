'use strict';
/** Outils communs aux tests : cœur partagé, fournisseur simulé « façon Claude », serveur de test. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const DM = require('../src/core');

// le store navigateur (localStorage → repli mémoire dans Node)
if (!DM.createStore) require(path.join(DM.ROOT, 'js/store.js'));

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'diagmaint-')); }

/** Petit JPEG valide (1×1 px) encodé en base64. */
const JPEG_1PX = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AN//Z';
/** PDF minimal valide. */
const PDF_MIN = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF').toString('base64');

/**
 * Fournisseur simulé : rejoue une suite de réponses au format Messages API.
 * Chaque étape : fonction (req) → {content, stop_reason} ou objet ; enregistre les requêtes reçues.
 */
function scriptedProvider(steps, name) {
  const requests = [];
  return {
    name: name || 'fake',
    requests: requests,
    supportsTool: function () { return true; },
    complete: async function (req) {
      requests.push(JSON.parse(JSON.stringify({ messages: req.messages, tools: req.tools.map(function (t) { return t.name; }), system: req.system })));
      const step = steps.shift();
      if (!step) return { content: [{ type: 'text', text: '(fin du script)' }], stop_reason: 'end_turn', usage: {} };
      const out = typeof step === 'function' ? await step(req) : step;
      return Object.assign({ usage: { input_tokens: 10, output_tokens: 5 } }, out);
    }
  };
}
let n = 0;
function toolUse(name, input) { return { type: 'tool_use', id: 'toolu_' + (++n), name: name, input: input }; }
function tools(...blocks) { return { content: blocks, stop_reason: 'tool_use' }; }
function text(t) { return { content: [{ type: 'text', text: t }], stop_reason: 'end_turn' }; }

/** Dernier résultat d'outil reçu par le fournisseur (pour vérifier les garde-fous). */
function lastToolResults(req) {
  const last = req.messages[req.messages.length - 1];
  return Array.isArray(last.content) ? last.content.filter(function (b) { return b.type === 'tool_result'; }) : [];
}

module.exports = { DM, tmpDir, JPEG_1PX, PDF_MIN, scriptedProvider, toolUse, tools, text, lastToolResults };
