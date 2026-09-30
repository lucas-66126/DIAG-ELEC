/* DIAG-MAINT — base documentaire (serveur) : fabricant › catégorie › série › modèle. */
(function (DM) {
  'use strict';
  const esc = DM.esc, icon = DM.icon, ui = DM.ui;
  const TYPES = { notice: 'Notice', schema: 'Schéma', manuel: 'Manuel', fiche_technique: 'Fiche technique', codes_defaut: 'Codes défaut', autre: 'Autre' };
  let filter = '';

  function treeHtml(tree, docs) {
    const byId = {};
    docs.forEach(function (d) { byId[d.id] = d; });
    const f = DM.normalize(filter);
    const keep = function (d) { return !f || DM.normalize([d.title, d.manufacturer, d.category, d.series, d.model, d.reference].join(' ')).indexOf(f) !== -1; };
    let html = '';
    Object.keys(tree).sort().forEach(function (man) {
      let manHtml = '';
      Object.keys(tree[man]).sort().forEach(function (cat) {
        Object.keys(tree[man][cat]).sort().forEach(function (ser) {
          Object.keys(tree[man][cat][ser]).sort().forEach(function (mod) {
            const items = tree[man][cat][ser][mod].map(function (x) { return byId[x.id]; }).filter(Boolean).filter(keep);
            if (!items.length) return;
            manHtml += '<div class="doc-group"><p class="small muted">' + esc(cat) + ' › ' + esc(ser) + ' › <b>' + esc(mod) + '</b></p>' +
              items.map(function (d) {
                return '<div class="doc-item">' + icon('file') + '<span class="doc-item__t"><b>' + esc(d.title) + '</b><small class="muted">' + esc(TYPES[d.docType] || d.docType) +
                  (d.reference ? ' · réf. ' + esc(d.reference) : '') + ' · ' + Math.max(1, Math.round(d.size / 1024)) + ' Ko</small></span>' +
                  '<button type="button" class="btn btn--sm btn--ghost" data-action="open-doc" data-id="' + esc(d.id) + '">Ouvrir</button>' +
                  '<button type="button" class="btn btn--sm btn--icon btn--danger-ghost" data-action="delete-doc" data-id="' + esc(d.id) + '" aria-label="Supprimer">' + icon('trash') + '</button></div>';
              }).join('') + '</div>';
          });
        });
      });
      if (manHtml) html += '<section class="card"><h3 class="card__title">' + icon('tag') + esc(man) + '</h3>' + manHtml + '</section>';
    });
    return html || '<div class="empty empty--sm">' + icon('file') + '<p>' + (docs.length ? 'Aucun document pour ce filtre.' : 'Aucun document. Ajoute des notices depuis la conversation (bouton « Document »).') + '</p></div>';
  }

  function load(root) {
    const box = root.querySelector('#docs');
    DM.agentClient.health().then(function (h) {
      if (!h.data || h.error) {
        box.innerHTML = '<div class="empty empty--sm">' + icon('cloud') + '<p>La base documentaire est stockée sur le serveur DIAG-MAINT.</p><p class="small muted">' + esc(h.error || '') + '</p>' +
          '<a class="btn btn--ghost" href="#/parametres">Configurer le serveur</a></div>';
        return;
      }
      return DM.agentClient.listDocuments().then(function (res) { box.innerHTML = treeHtml(res.tree || {}, res.documents || []); });
    }).catch(function (e) { box.innerHTML = '<p class="small">' + esc(e.message) + '</p>'; });
  }

  DM.views.documents = {
    render: function () {
      return {
        title: 'Documentation',
        back: '#/connaissances',
        html:
          '<div class="seg" role="tablist"><a class="seg__btn" role="tab" aria-selected="false" href="#/connaissances">' + icon('history') + 'Diagnostics</a>' +
          '<a class="seg__btn is-on" role="tab" aria-selected="true" href="#/documents">' + icon('file') + 'Documentation</a></div>' +
          '<label class="search">' + icon('search') + '<input type="search" id="doc-q" value="' + esc(filter) + '" placeholder="Filtrer : fabricant, modèle, référence…" aria-label="Filtrer"></label>' +
          '<div id="docs"><p class="small muted">Chargement…</p></div>'
      };
    },
    mount: function (root) {
      const input = root.querySelector('#doc-q');
      let t = null;
      input.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { filter = input.value; load(root); }, 250); });
      load(root);
    },
    actions: {
      'open-doc': function (el) {
        return DM.agentClient.fetchDocumentBlob(el.dataset.id).then(function (blob) {
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank', 'noopener');
          setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        });
      },
      'delete-doc': function (el) {
        return ui.confirm('Supprimer ce document de la base documentaire ?', { danger: true, okLabel: 'Supprimer' }).then(function (ok) {
          if (!ok) return;
          return DM.agentClient.deleteDocument(el.dataset.id).then(function () { ui.toast('Document supprimé', 'success'); DM.app.refresh(); });
        });
      }
    }
  };
})(window.DM);
