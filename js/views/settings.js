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
