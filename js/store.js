/* DIAG-MAINT — persistance des diagnostics et réglages (localStorage). */
(function (DM) {
  'use strict';

  const KEY = 'diagmaint.diagnostics.v1';
  const SKEY = 'diagmaint.settings.v1';
  const DEFAULT_SETTINGS = { theme: 'auto', technician: '', company: '' };

  /** Fabrique un store sur n'importe quel objet compatible Storage (injectable pour les tests). */
  DM.createStore = function (storage) {
    let cache = null;

    function read() {
      if (cache) return cache;
      try {
        const raw = storage.getItem(KEY);
        const list = raw ? JSON.parse(raw) : [];
        cache = Array.isArray(list) ? list : [];
      } catch (e) {
        console.error('DIAG-MAINT : lecture du stockage impossible', e);
        cache = [];
      }
      return cache;
    }
    function write(list) {
      try {
        storage.setItem(KEY, JSON.stringify(list));
        cache = list;
      } catch (e) {
        cache = null; // relire l'état réellement persisté
        const full = e && (e.name === 'QuotaExceededError' || e.code === 22);
        throw new Error(full ? 'Stockage du navigateur plein : exportez puis supprimez d’anciens diagnostics.' : 'Enregistrement impossible dans le navigateur.');
      }
    }

    return {
      all: function () {
        return DM.clone(read()).sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
      },
      get: function (id) {
        const d = read().find(function (x) { return x.id === id; });
        return d ? DM.clone(d) : null;
      },
      save: function (diag) {
        const list = read().slice();
        const i = list.findIndex(function (x) { return x.id === diag.id; });
        const copy = DM.clone(diag);
        if (i === -1) list.push(copy); else list[i] = copy;
        write(list);
        return copy;
      },
      remove: function (id) {
        write(read().filter(function (x) { return x.id !== id; }));
      },
      replaceAll: function (list) { write(DM.clone(list)); },
      clear: function () { write([]); },
      settings: function () {
        try { return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(storage.getItem(SKEY) || '{}')); }
        catch (e) { return Object.assign({}, DEFAULT_SETTINGS); }
      },
      saveSettings: function (s) {
        const merged = Object.assign(this.settings(), s);
        try { storage.setItem(SKEY, JSON.stringify(merged)); } catch (e) { /* réglage non critique */ }
        return merged;
      },
      sizeBytes: function () {
        try { return (storage.getItem(KEY) || '').length * 2; } catch (e) { return 0; }
      }
    };
  };

  /** Stockage mémoire de secours (navigation privée stricte, stockage bloqué). */
  DM.memoryStorage = function () {
    const m = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem: function (k, v) { m[k] = String(v); },
      removeItem: function (k) { delete m[k]; }
    };
  };

  let backend, persistent = true;
  try {
    backend = window.localStorage;
    backend.setItem('diagmaint.test', '1');
    backend.removeItem('diagmaint.test');
  } catch (e) {
    backend = DM.memoryStorage();
    persistent = false;
  }
  DM.store = DM.createStore(backend);
  DM.store.persistent = persistent;
})(window.DM);
