/* DIAG-MAINT — client de l'agent (navigateur).
 * En ligne avec un serveur configuré : POST /api/agent/turn (IA côté serveur, clé jamais dans le navigateur).
 * Hors ligne, sans serveur ou en mode « local » : même boucle d'agent exécutée localement (moteur à règles).
 */
(function (DM) {
  'use strict';

  const HEALTH_TTL = 60 * 1000;
  let health = { at: 0, url: null, data: null, error: null };

  function settings() { return DM.store.settings(); }

  /** URL du serveur : réglage explicite, sinon l'origine de la page si elle est servie par le serveur DIAG-MAINT. */
  function serverUrl() {
    const s = settings();
    if (s.serverUrl) return String(s.serverUrl).replace(/\/+$/, '');
    if (/^https?:$/.test(location.protocol) && !/github\.io$/i.test(location.hostname)) return location.origin;
    return '';
  }

  function headers() {
    const h = { 'Content-Type': 'application/json' };
    const t = settings().serverToken;
    if (t) h['X-App-Token'] = t;
    return h;
  }

  async function fetchJson(path, opts, timeoutMs) {
    const url = serverUrl();
    if (!url) throw DM.agent.AgentError('no_server', 'Aucun serveur IA configuré.', false);
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 15000) : null;
    let res;
    try {
      res = await fetch(url + path, Object.assign({ headers: headers(), signal: ctrl && ctrl.signal }, opts || {}));
    } catch (e) {
      throw DM.agent.AgentError(e && e.name === 'AbortError' ? 'timeout' : 'network',
        e && e.name === 'AbortError' ? 'Le serveur ne répond pas (délai dépassé).' : 'Serveur injoignable.', true);
    } finally { if (timer) clearTimeout(timer); }
    let body = null;
    try { body = await res.json(); } catch (e) { body = null; }
    if (!res.ok) {
      const err = body && body.error ? body.error : { code: 'http_' + res.status, message: 'Erreur serveur (' + res.status + ').' };
      throw DM.agent.AgentError(err.code, err.message, !!err.retryable);
    }
    return body;
  }

  DM.agentClient = {
    serverUrl: serverUrl,

    /** État du serveur (mis en cache une minute). */
    health: async function (force) {
      const url = serverUrl();
      if (!url) return (health = { at: Date.now(), url: '', data: null, error: 'Aucun serveur configuré' });
      if (!force && health.url === url && Date.now() - health.at < HEALTH_TTL) return health;
      try {
        const data = await fetchJson('/api/health', { method: 'GET' }, 6000);
        health = { at: Date.now(), url: url, data: data, error: data.auth && data.auth.required && !data.auth.valid ? 'Jeton d’accès invalide' : null };
      } catch (e) {
        health = { at: Date.now(), url: url, data: null, error: e.message };
      }
      return health;
    },
    lastHealth: function () { return health; },

    /** Une vraie IA répondra-t-elle ? (serveur joignable, fournisseur autre que le moteur local, clé présente) */
    aiOnline: function () {
      if (settings().agentMode === 'local' || (typeof navigator !== 'undefined' && navigator.onLine === false)) return false;
      const p = health.data && !health.error ? health.data.provider || {} : null;
      return !!(p && p.name !== 'local' && p.available !== false);
    },

    /** Le prochain tour passera-t-il par le serveur ? */
    willUseServer: function () {
      if (settings().agentMode === 'local') return false;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
      return !!(health.data && !health.error);
    },

    /** Fiches de connaissance locales envoyées avec la requête (l'agent peut chercher dans l'historique de l'appareil). */
    knowledgeDigest: function (excludeId) {
      return DM.kb.fromDiagnostics(DM.store.all().filter(function (d) { return d.id !== excludeId; })).slice(0, 60);
    },

    /** Photos jointes au dernier message du technicien, en base64 pour le serveur. */
    imagesFor: async function (d) {
      const last = d.messages[d.messages.length - 1];
      const out = {};
      for (const a of (last && last.attachments) || []) {
        if (a.type !== 'photo') continue;
        try {
          const url = await DM.photos.toDataURL(a.id);
          const m = url && url.match(/^data:([^;]+);base64,(.*)$/);
          if (m) out[a.id] = { mediaType: m[1], data: m[2] };
        } catch (e) { /* photo indisponible : l'agent sera prévenu par l'état */ }
      }
      return out;
    },

    /**
     * Exécute un tour. Le dernier message de d est celui du technicien.
     * @returns {Promise<{result, remote: boolean, fallback: string|null}>}
     */
    turn: async function (d, opts) {
      opts = opts || {};
      const mode = settings().agentMode || 'auto';
      if (mode !== 'local' && !opts.forceLocal) {
        await DM.agentClient.health();
        if (DM.agentClient.willUseServer()) {
          try {
            const body = { diag: d, images: await DM.agentClient.imagesFor(d), knowledge: DM.agentClient.knowledgeDigest(d.id) };
            const result = await fetchJson('/api/agent/turn', { method: 'POST', body: JSON.stringify(body) }, 5 * 60 * 1000);
            return { result: result, remote: true, fallback: null };
          } catch (e) {
            // réseau coupé en cours de route : on bascule sur le moteur local plutôt que de bloquer le technicien
            if (e.code === 'network' || e.code === 'no_server') {
              health.error = e.message;
              const local = await DM.agentClient.runLocal(d);
              return { result: local, remote: false, fallback: 'Serveur injoignable : réponse du moteur local (sans IA).' };
            }
            throw e;
          }
        }
      }
      const local = await DM.agentClient.runLocal(d);
      const why = mode === 'local' ? null : (navigator.onLine === false ? 'Hors connexion : moteur local (sans IA).' :
        (health.error ? 'IA indisponible (' + health.error + ') : moteur local.' : null));
      return { result: local, remote: false, fallback: why };
    },

    runLocal: async function (d) {
      const kbEntries = DM.agentClient.knowledgeDigest(d.id);
      return DM.agent.runLocalTurn({ diag: d, services: { knowledge: { entries: async function () { return kbEntries; } } } });
    },

    /* ---- Base documentaire (serveur) ---- */
    listDocuments: function (q) {
      const qs = q ? '?' + new URLSearchParams(q).toString() : '';
      return fetchJson('/api/documents' + qs, { method: 'GET' }, 15000);
    },
    uploadDocument: function (meta, mediaType, data) {
      return fetchJson('/api/documents', { method: 'POST', body: JSON.stringify({ meta: meta, mediaType: mediaType, data: data }) }, 5 * 60 * 1000);
    },
    deleteDocument: function (id) { return fetchJson('/api/documents/' + encodeURIComponent(id), { method: 'DELETE' }, 15000); },
    documentUrl: function (id) { return serverUrl() + '/api/documents/' + encodeURIComponent(id) + '/file'; },
    fetchDocumentBlob: async function (id) {
      const res = await fetch(DM.agentClient.documentUrl(id), { headers: headers() });
      if (!res.ok) throw new Error('Document indisponible (' + res.status + ').');
      return res.blob();
    },

    /* ---- Connaissances (serveur) ---- */
    pushKnowledge: function (diagnostics) {
      return fetchJson('/api/knowledge', { method: 'POST', body: JSON.stringify({ diagnostics: diagnostics }) }, 60000);
    },
    searchKnowledge: function (q) {
      return fetchJson('/api/knowledge/search?' + new URLSearchParams(q).toString(), { method: 'GET' }, 15000);
    }
  };
})(window.DM);
