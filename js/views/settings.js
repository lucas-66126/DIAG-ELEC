/* DIAG-MAINT — réglages : thème, identité du technicien, sauvegarde / restauration des données */
(function (DM) {
  'use strict';
  const esc = DM.esc, icon = DM.icon;

  function fmtSize(b) {
    if (b < 1024) return b + ' o';
    if (b < 1048576) return (b / 1024).toFixed(0) + ' Ko';
    return (b / 1048576).toFixed(1) + ' Mo';
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  DM.download = download;

  function exportData() {
    const all = DM.store.all();
    const ids = [];
    all.forEach(function (d) { (d.photos || []).forEach(function (p) { ids.push(p.id); }); });
    const photos = {};
    return Promise.all(ids.map(function (id) {
      return DM.photos.toDataURL(id).then(function (u) { if (u) photos[id] = u; }).catch(function () {});
    })).then(function () {
      const payload = { app: 'DIAG-MAINT', format: 1, exportedAt: new Date().toISOString(), diagnostics: all, photos: photos };
      DM.download('diag-maint-sauvegarde-' + DM.todayISO() + '.json', JSON.stringify(payload));
      DM.ui.toast(DM.plural(all.length, 'diagnostic exporté', 'diagnostics exportés'), 'success');
    });
  }

  function importFile(file) {
    return file.text().then(function (txt) {
      let data;
      try { data = JSON.parse(txt); } catch (e) { throw new Error('Fichier illisible (JSON invalide).'); }
      if (!data || data.app !== 'DIAG-MAINT' || !Array.isArray(data.diagnostics)) throw new Error('Ce fichier n’est pas une sauvegarde DIAG-MAINT.');
      const valid = data.diagnostics.filter(function (d) { return d && d.id && d.name && Array.isArray(d.hypotheses) && Array.isArray(d.controls); });
      const existing = DM.store.all().map(function (d) { return d.id; });
      const replaced = valid.filter(function (d) { return existing.indexOf(d.id) !== -1; }).length;
      return DM.ui.confirm('Importer ' + DM.plural(valid.length, 'diagnostic') + ' ?', {
        title: 'Importer une sauvegarde', okLabel: 'Importer',
        detail: replaced ? replaced + ' diagnostic(s) existant(s) portant le même identifiant seront remplacés.' : 'Les diagnostics actuels sont conservés.'
      }).then(function (ok) {
        if (!ok) return;
        const photos = data.photos || {};
        return Promise.all(valid.map(function (d) {
          return Promise.all((d.photos || []).map(function (p) {
            return photos[p.id] ? DM.photos.fromDataURL(p.id, d.id, photos[p.id]).catch(function () {}) : null;
          })).then(function () { DM.store.save(d); });
        })).then(function () {
          DM.ui.toast(DM.plural(valid.length, 'diagnostic importé', 'diagnostics importés'), 'success');
          DM.app.refresh();
        });
      });
    });
  }

  DM.views.settings = {
    render: function () {
      const s = DM.store.settings();
      const all = DM.store.all();
      const themes = [['auto', 'auto', 'Auto'], ['light', 'sun', 'Clair'], ['dark', 'moon', 'Sombre']];
      return {
        title: 'Réglages',
        html:
          '<section class="card"><h3 class="card__title">' + icon('sun') + 'Affichage</h3>' +
            '<div class="seg" role="radiogroup" aria-label="Thème">' + themes.map(function (t) {
              return '<button type="button" role="radio" class="seg__btn' + (s.theme === t[0] ? ' is-on' : '') + '" aria-checked="' + (s.theme === t[0]) + '" data-action="set-theme" data-v="' + t[0] + '">' + icon(t[1]) + t[2] + '</button>';
            }).join('') + '</div></section>' +
          '<section class="card"><h3 class="card__title">' + icon('cloud') + 'Serveur IA</h3>' +
            '<p class="small muted">L’agent IA fonctionne via le serveur DIAG-MAINT (la clé d’API reste sur le serveur). ' +
            'Sans serveur ou sans réseau, le moteur local (sans IA) prend le relais.</p>' +
            '<form id="server-form" class="form">' +
              '<div class="field"><label for="s-url">Adresse du serveur</label><input id="s-url" name="serverUrl" type="url" inputmode="url" value="' + esc(s.serverUrl || '') + '" placeholder="' + esc(DM.agentClient.serverUrl() || 'https://mon-serveur.exemple') + '">' +
                '<p class="hint">Laisser vide si l’application est ouverte depuis le serveur lui-même.</p></div>' +
              '<div class="field"><label for="s-token">Jeton d’accès</label><input id="s-token" name="serverToken" type="password" autocomplete="off" value="' + esc(s.serverToken || '') + '" placeholder="APP_ACCESS_TOKEN du serveur">' +
                '<p class="hint">Ce n’est pas une clé d’IA : c’est le mot de passe de ton serveur.</p></div>' +
              '<div class="seg" role="radiogroup" aria-label="Moteur">' + [['auto', 'Auto (IA si disponible)'], ['local', 'Toujours local']].map(function (m) {
                return '<button type="button" role="radio" class="seg__btn' + ((s.agentMode || 'auto') === m[0] ? ' is-on' : '') + '" aria-checked="' + ((s.agentMode || 'auto') === m[0]) + '" data-action="set-mode" data-v="' + m[0] + '">' + m[1] + '</button>';
              }).join('') + '</div>' +
            '</form>' +
            '<div class="server-status" id="server-status"><span class="muted small">…</span></div>' +
            '<div class="btnrow"><button type="button" class="btn btn--ghost" data-action="test-server">' + icon('cloud') + 'Tester la connexion</button>' +
            '<button type="button" class="btn btn--ghost" data-action="sync-now">' + icon('upload') + 'Synchroniser (' + DM.sync.pending().length + ')</button></div>' +
          '</section>' +
          '<section class="card"><h3 class="card__title">' + icon('file') + 'Compte-rendu</h3>' +
            '<form id="settings-form" class="form">' +
              '<div class="field"><label for="s-tech">Nom du technicien</label><input id="s-tech" name="technician" value="' + esc(s.technician) + '" autocomplete="name" placeholder="Apparaît sur les comptes-rendus"></div>' +
              '<div class="field"><label for="s-comp">Entreprise / service</label><input id="s-comp" name="company" value="' + esc(s.company) + '" autocomplete="organization"></div>' +
            '</form></section>' +
          '<section class="card"><h3 class="card__title">' + icon('download') + 'Données</h3>' +
            '<p class="small muted">Les données sont stockées uniquement dans ce navigateur, sur cet appareil (' + DM.plural(all.length, 'diagnostic') + ', ' + fmtSize(DM.store.sizeBytes()) + ' hors photos' + '<span id="s-quota"></span>). ' +
            'Exportez régulièrement une sauvegarde.</p>' +
            '<div class="btncol">' +
              '<button type="button" class="btn btn--ghost btn--block" data-action="export">' + icon('download') + 'Exporter une sauvegarde (.json)</button>' +
              '<label class="btn btn--ghost btn--block">' + icon('upload') + 'Importer une sauvegarde<input type="file" accept="application/json,.json" id="s-import" hidden></label>' +
              '<button type="button" class="btn btn--danger-ghost btn--block" data-action="wipe">' + icon('trash') + 'Effacer toutes les données</button>' +
            '</div></section>' +
          '<p class="small muted center">DIAG-MAINT v' + DM.VERSION + ' — assistant de diagnostic. Les suggestions sont une aide : ' +
          'le technicien reste responsable de ses conclusions et du respect des règles de sécurité.</p>'
      };
    },
    mount: function (root) {
      function showStatus(h) {
        const el = root.querySelector('#server-status');
        if (!el) return;
        if (!h.url) { el.innerHTML = '<span class="chip chip--todo">Aucun serveur</span> <span class="small muted">moteur local</span>'; return; }
        if (h.data && !h.error) {
          const p = h.data.provider || {};
          el.innerHTML = DM.ui.chip('Connecté', 'ok', 'check') + ' <span class="small">' + esc(h.url) + ' — ' +
            (p.name === 'local' ? 'serveur sans clé d’IA (moteur local)' : esc(p.name) + (p.model ? ' · ' + esc(p.model) : '') + (p.available === false ? ' · clé manquante' : '') + (p.webSearch ? ' · recherche Web' : '')) + '</span>';
        } else el.innerHTML = DM.ui.chip('Indisponible', 'ko', 'alert') + ' <span class="small">' + esc(h.error || '') + '</span>';
      }
      DM.agentClient.health().then(showStatus);
      root.querySelector('#server-form').addEventListener('change', function (e) {
        if (!e.target.name) return;
        const o = {}; o[e.target.name] = e.target.value.trim();
        DM.store.saveSettings(o);
        DM.agentClient.health(true).then(showStatus);
      });
      root.querySelector('#settings-form').addEventListener('change', function (e) {
        const o = {}; o[e.target.name] = e.target.value.trim();
        DM.store.saveSettings(o);
        DM.ui.toast('Réglage enregistré', 'success');
      });
      root.querySelector('#s-import').addEventListener('change', function (e) {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if (f) importFile(f).catch(function (err) { DM.ui.toast(err.message, 'error'); });
      });
      if (navigator.storage && navigator.storage.estimate) {
        navigator.storage.estimate().then(function (est) {
          const el = root.querySelector('#s-quota');
          if (el && est.usage != null) el.textContent = ' ; ' + fmtSize(est.usage) + ' utilisés au total, photos comprises';
        }).catch(function () {});
      }
    },
    actions: {
      'set-mode': function (el) {
        DM.store.saveSettings({ agentMode: el.dataset.v });
        DM.app.refresh();
      },
      'test-server': function () {
        return DM.agentClient.health(true).then(function (h) {
          DM.ui.toast(h.data && !h.error ? 'Serveur joignable' : 'Serveur indisponible : ' + (h.error || ''), h.data && !h.error ? 'success' : 'error');
          DM.app.refresh();
        });
      },
      'sync-now': function () {
        return DM.sync.flush().then(function (n) {
          DM.ui.toast(n ? DM.plural(n, 'diagnostic synchronisé', 'diagnostics synchronisés') : 'Rien à synchroniser (ou serveur injoignable)', n ? 'success' : 'info');
          DM.app.refresh();
        });
      },
      'set-theme': function (el) {
        DM.store.saveSettings({ theme: el.dataset.v });
        DM.applyTheme(el.dataset.v);
        DM.app.refresh();
      },
      'export': exportData,
      'wipe': function () {
        return DM.ui.confirm('Effacer TOUS les diagnostics et photos de cet appareil ?', {
          title: 'Tout effacer', danger: true, okLabel: 'Tout effacer',
          detail: 'Action irréversible. Pensez à exporter une sauvegarde avant.'
        }).then(function (ok) {
          if (!ok) return;
          DM.store.clear();
          return DM.photos.clearAll().catch(function () {}).then(function () {
            DM.ui.toast('Données effacées', 'success');
            DM.app.refresh();
          });
        });
      }
    }
  };
})(window.DM);
