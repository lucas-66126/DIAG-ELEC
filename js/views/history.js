/* DIAG-MAINT — historique : recherche, filtres, ouvrir / modifier / dupliquer / supprimer */
(function (DM) {
  'use strict';
  const esc = DM.esc, icon = DM.icon;
  const filters = { q: '', status: 'all', type: '' };

  function matches(d) {
    if (filters.status !== 'all' && d.status !== filters.status) return false;
    if (filters.type && d.installationType !== filters.type) return false;
    if (!filters.q) return true;
    const hay = DM.normalize([d.name, d.brand, d.model, d.reference, d.location, d.description, d.symptoms, d.finalDiagnosis,
      DM.installType(d.installationType).label].join(' '));
    return DM.normalize(filters.q).split(/\s+/).every(function (w) { return hay.indexOf(w) !== -1; });
  }

  function listHtml() {
    const all = DM.store.all();
    const list = all.filter(matches);
    if (!all.length) {
      return '<div class="empty">' + icon('history') + '<h2>Aucun diagnostic</h2><p class="muted">Vos diagnostics apparaîtront ici.</p>' +
        '<a class="btn btn--primary btn--lg" href="#/nouveau">' + icon('plus') + 'Nouveau diagnostic</a></div>';
    }
    if (!list.length) return '<div class="empty empty--sm">' + icon('search') + '<p>Aucun résultat pour ces critères.</p></div>';
    return '<p class="small muted">' + DM.plural(list.length, 'diagnostic') + '</p><div class="list">' +
      list.map(function (d) { return DM.ui.diagItem(d, true); }).join('') + '</div>';
  }

  DM.views.history = {
    render: function () {
      const seg = [['all', 'Tous'], ['en_cours', 'En cours'], ['cloture', 'Clôturés']];
      return {
        title: 'Historique',
        html:
          '<div class="toolbar">' +
            '<label class="search">' + icon('search') + '<input type="search" id="h-search" placeholder="Rechercher (nom, marque, référence…)" value="' + esc(filters.q) + '" aria-label="Rechercher"></label>' +
            '<div class="toolbar__row">' +
              '<div class="seg seg--sm" role="group" aria-label="Statut">' + seg.map(function (s) {
                return '<button type="button" class="seg__btn' + (filters.status === s[0] ? ' is-on' : '') + '" data-action="filter-status" data-v="' + s[0] + '" aria-pressed="' + (filters.status === s[0]) + '">' + s[1] + '</button>';
              }).join('') + '</div>' +
              '<select id="h-type" class="select" aria-label="Type d’installation"><option value="">Tous les types</option>' +
                DM.INSTALL_TYPES.map(function (t) { return '<option value="' + t.id + '"' + (filters.type === t.id ? ' selected' : '') + '>' + esc(t.label) + '</option>'; }).join('') +
              '</select>' +
            '</div>' +
          '</div>' +
          '<div id="h-list">' + listHtml() + '</div>'
      };
    },
    mount: function (root) {
      const search = root.querySelector('#h-search');
      search.addEventListener('input', function () { filters.q = search.value.trim(); root.querySelector('#h-list').innerHTML = listHtml(); });
      root.querySelector('#h-type').addEventListener('change', function (e) { filters.type = e.target.value; root.querySelector('#h-list').innerHTML = listHtml(); });
    },
    actions: {
      'filter-status': function (el) { filters.status = el.dataset.v; DM.app.refresh(); },
      'duplicate': function (el) {
        return DM.ops.duplicate(el.dataset.id).then(function (copy) {
          DM.ui.toast('Copie créée : ' + copy.name, 'success');
          DM.app.refresh();
        });
      },
      'delete': function (el) {
        return DM.ops.confirmDelete(el.dataset.id).then(function (ok) { if (ok) DM.app.refresh(); });
      }
    }
  };
})(window.DM);
