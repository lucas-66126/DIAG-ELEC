/* DIAG-MAINT — file de synchronisation (hors connexion → serveur).
 * Les diagnostics aboutis sont mis en file ; la file est vidée vers POST /api/knowledge
 * dès que le serveur est joignable (démarrage, retour du réseau, après un tour en ligne).
 * Architecture prête pour une synchronisation complète ; seule la base de connaissances est synchronisée en V2.
 */
(function (DM) {
  'use strict';
  const KEY = 'diagmaint.sync.v1';
  let flushing = false;

  function read() {
    try { const q = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(q) ? q : []; } catch (e) { return []; }
  }
  function write(q) { try { localStorage.setItem(KEY, JSON.stringify(q)); } catch (e) { /* non critique */ } }

  DM.sync = {
    pending: function () { return read(); },
    enqueue: function (diagId) {
      const q = read();
      if (q.indexOf(diagId) === -1) { q.push(diagId); write(q); }
    },
    /** Envoie la file ; renvoie le nombre de diagnostics synchronisés (0 si hors ligne). */
    flush: async function () {
      if (flushing) return 0;
      const q = read();
      if (!q.length || (typeof navigator !== 'undefined' && navigator.onLine === false) || !DM.agentClient.serverUrl()) return 0;
      flushing = true;
      try {
        const h = await DM.agentClient.health();
        if (!h.data || h.error) return 0;
        const diags = q.map(function (id) { return DM.store.get(id); }).filter(Boolean);
        if (diags.length) await DM.agentClient.pushKnowledge(diags);
        write(read().filter(function (id) { return q.indexOf(id) === -1; }));
        return diags.length;
      } catch (e) {
        return 0; // on réessaiera au prochain retour de connexion
      } finally { flushing = false; }
    }
  };

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('online', function () { DM.sync.flush(); });
  }
})(window.DM);
