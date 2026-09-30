/* DIAG-MAINT — photos : compression + stockage IndexedDB (plus de place que localStorage). */
(function (DM) {
  'use strict';

  const DB_NAME = 'diagmaint', STORE = 'photos', MAX_SIDE = 1600, QUALITY = 0.8;
  let dbPromise = null;
  const urlCache = {};

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error('Photos indisponibles : IndexedDB non supporté par ce navigateur.'));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('diagId', 'diagId');
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('Ouverture de la base photos impossible.')); };
    });
    dbPromise.catch(function () { dbPromise = null; });
    return dbPromise;
  }

  function tx(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        let result;
        Promise.resolve(fn(store, function (r) { result = r; })).catch(reject);
        t.oncomplete = function () { resolve(result); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('Transaction annulée.')); };
      });
    });
  }
  function reqP(r) {
    return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; });
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Image illisible : ' + (file.name || 'photo'))); };
      img.src = url;
    });
  }

  /** Redimensionne (côté max 1600 px) et convertit en JPEG. */
  function compress(file) {
    return loadImage(file).then(function (img) {
      const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      return new Promise(function (resolve) {
        canvas.toBlob(function (b) { resolve(b || file); }, 'image/jpeg', QUALITY);
      });
    });
  }

  function blobToDataURL(blob) {
    return new Promise(function (resolve, reject) {
      const fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsDataURL(blob);
    });
  }
  function dataURLToBlob(dataUrl) {
    const parts = String(dataUrl).split(',');
    const mime = (parts[0].match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
    const bin = atob(parts[1] || '');
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function put(rec) { return tx('readwrite', function (s) { s.put(rec); }).then(function () { return rec.id; }); }

  DM.photos = {
    available: function () { return open().then(function () { return true; }, function () { return false; }); },

    /** Ajoute un fichier image ; renvoie l'id de la photo. */
    add: function (diagId, file) {
      return compress(file).then(function (blob) {
        return put({ id: DM.uid('pho'), diagId: diagId, blob: blob, createdAt: new Date().toISOString() });
      });
    },

    get: function (id) { return tx('readonly', function (s, done) { return reqP(s.get(id)).then(done); }); },

    /** URL affichable (mise en cache). */
    url: function (id) {
      if (urlCache[id]) return Promise.resolve(urlCache[id]);
      return this.get(id).then(function (rec) {
        if (!rec) return null;
        urlCache[id] = URL.createObjectURL(rec.blob);
        return urlCache[id];
      });
    },

    remove: function (id) {
      if (urlCache[id]) { URL.revokeObjectURL(urlCache[id]); delete urlCache[id]; }
      return tx('readwrite', function (s) { s.delete(id); });
    },

    removeMany: function (ids) {
      return Promise.all((ids || []).map(function (id) { return DM.photos.remove(id); })).catch(function () {});
    },

    /** Copie des photos vers un autre diagnostic ; renvoie {ancienId: nouvelId}. */
    copy: function (ids, newDiagId) {
      const map = {};
      return Promise.all((ids || []).map(function (id) {
        return DM.photos.get(id).then(function (rec) {
          if (!rec) return;
          const nid = DM.uid('pho');
          map[id] = nid;
          return put({ id: nid, diagId: newDiagId, blob: rec.blob, createdAt: new Date().toISOString() });
        });
      })).then(function () { return map; });
    },

    toDataURL: function (id) {
      return this.get(id).then(function (rec) { return rec ? blobToDataURL(rec.blob) : null; });
    },
    fromDataURL: function (id, diagId, dataUrl) {
      return put({ id: id, diagId: diagId, blob: dataURLToBlob(dataUrl), createdAt: new Date().toISOString() });
    },

    clearAll: function () { return tx('readwrite', function (s) { s.clear(); }); }
  };
})(window.DM);
