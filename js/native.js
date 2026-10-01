/* DIAG-MAINT — passerelle vers l'application Android (enveloppe Capacitor).
 * Dans un navigateur, rien de tout cela ne sert : DM.isNativeApp() est faux.
 * Dans l'application, le partage et l'enregistrement de fichiers passent par les modules natifs
 * « Share » et « Filesystem », car une page embarquée ne peut ni télécharger ni imprimer. */
(function (DM) {
  'use strict';

  function call(plugin, method, options) {
    const C = window.Capacitor;
    if (!C) return Promise.reject(new Error('Application native indisponible'));
    if (C.Plugins && C.Plugins[plugin] && typeof C.Plugins[plugin][method] === 'function') return C.Plugins[plugin][method](options || {});
    if (typeof C.nativePromise === 'function') return C.nativePromise(plugin, method, options || {});
    return Promise.reject(new Error('Module « ' + plugin + ' » indisponible'));
  }
  /** Annulation du partage par l'utilisateur : ce n'est pas une erreur. */
  function cancelled(e) { return !!(e && /cancel|abort/i.test(String(e.message || e))); }

  DM.native = {
    /** Ouvre la feuille de partage Android avec un texte. */
    shareText: function (title, text) {
      return call('Share', 'share', { title: title, text: text, dialogTitle: title }).catch(function (e) { if (!cancelled(e)) throw e; });
    },
    /** Écrit un fichier texte dans le cache de l'application puis propose de l'enregistrer ou de l'envoyer. */
    shareFile: function (filename, text) {
      return call('Filesystem', 'writeFile', { path: filename, data: text, directory: 'CACHE', encoding: 'utf8' })
        .then(function (res) { return call('Share', 'share', { title: filename, files: [res.uri], dialogTitle: filename }); })
        .catch(function (e) { if (!cancelled(e)) throw e; });
    }
  };
})(window.DM);
