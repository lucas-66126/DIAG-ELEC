/* DIAG-MAINT — persistance locale (localStorage) : diagnostics, équipements, bibliothèque, réglages. */
(function (DM) {
  'use strict';

  const KEYS = {
    diagnostics: 'diagmaint.diagnostics.v1',
    equipments: 'diagmaint.equipments.v1',
    library: 'diagmaint.library.v1',
    settings: 'diagmaint.settings.v1'
  };
  const DEFAULT_SETTINGS = { theme: 'auto', technician: '', company: '' };

  /** Collection d'objets {id, updatedAt} stockée sous une clé. `migrate` normalise chaque objet lu. */
  function collection(storage, key, migrate) {
    let cache = null;
    const fix = migrate || function (x) { return x; };

    function read() {
      if (cache) return cache;
      try {
        const raw = storage.getItem(key);
        const list = raw ? JSON.parse(raw) : [];
        cache = Array.isArray(list) ? list.map(fix) : [];
      } catch (e) {
        console.error('DIAG-MAINT : lecture du stockage impossible (' + key + ')', e);
        cache = [];
      }
      return cache;
    }
    function write(list) {
      try {
        storage.setItem(key, JSON.stringify(list));
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
        const x = read().find(function (o) { return o.id === id; });
        return x ? DM.clone(x) : null;
      },
      save: function (obj) {
        const list = read().slice();
        const i = list.findIndex(function (o) { return o.id === obj.id; });
        const copy = DM.clone(obj);
        if (i === -1) list.push(copy); else list[i] = copy;
        write(list);
        return copy;
      },
      remove: function (id) { write(read().filter(function (o) { return o.id !== id; })); },
      replaceAll: function (list) { write(DM.clone(list)); },
      clear: function () { write([]); },
      sizeBytes: function () {
        try { return (storage.getItem(key) || '').length * 2; } catch (e) { return 0; }
      }
    };
  }

  /** Fabrique un store sur n'importe quel objet compatible Storage (injectable pour les tests). */
  DM.createStore = function (storage) {
    const diags = collection(storage, KEYS.diagnostics, function (d) { return DM.normalizeDiag ? DM.normalizeDiag(d) : d; });
    const store = Object.assign({}, diags, {
      equipments: collection(storage, KEYS.equipments),
      library: collection(storage, KEYS.library),
      settings: function () {
        try { return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(storage.getItem(KEYS.settings) || '{}')); }
        catch (e) { return Object.assign({}, DEFAULT_SETTINGS); }
      },
      saveSettings: function (s) {
        const merged = Object.assign(store.settings(), s);
        try { storage.setItem(KEYS.settings, JSON.stringify(merged)); } catch (e) { /* réglage non critique */ }
        return merged;
      },
      totalBytes: function () {
        return diags.sizeBytes() + store.equipments.sizeBytes() + store.library.sizeBytes();
      }
    });
    return store;
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
