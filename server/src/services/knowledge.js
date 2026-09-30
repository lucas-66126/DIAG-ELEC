'use strict';
/**
 * Base de connaissances serveur : fiches issues des diagnostics terminés, reçues par la file de
 * synchronisation du téléphone (POST /api/knowledge). data/knowledge/entries.json
 * (un vrai SGBD pourra remplacer ce fichier sans changer l'interface).
 */
const path = require('path');
const DM = require('../core');
const files = require('./files');

class KnowledgeStore {
  constructor(dataDir) {
    this.dir = files.ensureDir(path.join(dataDir, 'knowledge'));
    this.file = path.join(this.dir, 'entries.json');
  }
  all() { return files.readJson(this.file, []); }

  /** Ajoute / remplace les fiches des diagnostics fournis ; renvoie le nombre accepté. */
  upsertDiagnostics(diags) {
    const list = this.all();
    let n = 0;
    (diags || []).forEach(function (raw) {
      if (!raw || !raw.id || !Array.isArray(raw.hypotheses)) return;
      const d = DM.normalizeDiag(DM.clone(raw));
      const e = DM.kb.fromDiagnostic(d);
      const i = list.findIndex(function (x) { return x.diagId === e.diagId; });
      if (i === -1) list.push(e); else list[i] = e;
      n++;
    });
    if (n) files.writeJson(this.file, list);
    return n;
  }

  /** Service fourni à l'agent : fiches serveur + fiches locales envoyées avec la requête (sans doublon). */
  service(clientEntries) {
    const self = this;
    return {
      entries: async function () {
        const server = self.all();
        const extra = (Array.isArray(clientEntries) ? clientEntries : []).filter(function (e) {
          return e && e.diagId && Array.isArray(e.symptoms) && Array.isArray(e.errorCodes) && !server.some(function (s) { return s.diagId === e.diagId; });
        });
        return server.concat(extra);
      }
    };
  }
}

module.exports = { KnowledgeStore };
