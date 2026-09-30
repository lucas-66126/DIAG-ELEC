/* DIAG-MAINT — routeur, coque de l'application, opérations partagées. */
(function (DM) {
  'use strict';
  const esc = DM.esc, icon = DM.icon;
  DM.VERSION = '2.0.0';
  DM.views = DM.views || {};

  const ROUTES = [
    [/^\/?$/, 'home'],
    [/^\/nouveau$/, 'form'],
    [/^\/diag\/([^/]+)$/, 'agent'],
    [/^\/diag\/([^/]+)\/arbre$/, 'diag'],
    [/^\/diag\/([^/]+)\/modifier$/, 'form'],
    [/^\/diag\/([^/]+)\/rapport$/, 'report'],
    [/^\/historique$/, 'history'],
    [/^\/connaissances$/, 'knowledge'],
    [/^\/documents$/, 'documents'],
    [/^\/parametres$/, 'settings']
  ];

  /* ---------- thème ---------- */
  const THEMES = ['auto', 'light', 'dark'];
  const THEME_LABEL = { auto: 'Thème automatique', light: 'Thème clair', dark: 'Thème sombre' };
  const THEME_ICON = { auto: 'auto', light: 'sun', dark: 'moon' };
  DM.applyTheme = function (theme) {
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme); else root.removeAttribute('data-theme');
    const dark = theme === 'dark' || (theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute('content', dark ? '#14181d' : '#2b3440');
    const btn = document.getElementById('theme-btn');
    if (btn) { btn.innerHTML = icon(THEME_ICON[theme] || 'auto'); btn.setAttribute('aria-label', THEME_LABEL[theme] + ' (changer)'); btn.title = THEME_LABEL[theme]; }
  };

  /* ---------- opérations partagées ---------- */
  DM.ops = {
    /** Nouveau diagnostic piloté par l'agent : ouvre directement la conversation. */
    newAgentDiag: function () {
      const d = DM.createDraft({});
      DM.addMessage(d, { role: 'assistant', text: 'Décris-moi la panne. Tu peux également ajouter une photo.' });
      DM.store.save(d);
      DM.app.go('/diag/' + encodeURIComponent(d.id));
      return d;
    },
    duplicate: function (id) {
      const d = DM.store.get(id);
      if (!d) return Promise.reject(new Error('Diagnostic introuvable.'));
      const newId = DM.uid('diag');
      const ids = (d.photos || []).map(function (p) { return p.id; });
      return DM.photos.copy(ids, newId).catch(function () { return {}; }).then(function (map) {
        const copy = DM.duplicateDiagnostic(d, { id: newId, photoMap: map });
        DM.store.save(copy);
        return copy;
      });
    },
    remove: function (id) {
      const d = DM.store.get(id);
      if (!d) return;
      DM.store.remove(id);
      DM.photos.removeMany((d.photos || []).map(function (p) { return p.id; }));
    },
    confirmDelete: function (id) {
      const d = DM.store.get(id);
      if (!d) return Promise.resolve(false);
      return DM.ui.confirm('Supprimer définitivement le diagnostic « ' + d.name + ' » ?', {
        title: 'Supprimer', danger: true, okLabel: 'Supprimer',
        detail: 'Hypothèses, contrôles et photos associés seront supprimés. Cette action est irréversible.'
      }).then(function (ok) {
        if (ok) { DM.ops.remove(id); DM.ui.toast('Diagnostic supprimé', 'success'); }
        return ok;
      });
    }
  };

  /** Élément de liste d'un diagnostic (accueil, historique). */
  DM.ui.diagItem = function (d, withActions) {
    const T = DM.installType(d.installationType);
    const S = DM.DIAG_STATUS[d.status] || DM.DIAG_STATUS.en_cours;
    const st = DM.diagStats(d);
    const equip = [d.brand, d.model, d.reference].filter(Boolean).join(' · ');
    return '<article class="diag-item">' +
      '<a class="diag-item__main" href="#/diag/' + encodeURIComponent(d.id) + '">' +
      '<span class="diag-item__icon">' + icon(T.icon) + '</span>' +
      '<span class="diag-item__body"><strong>' + esc(d.name) + '</strong>' +
      '<span class="muted small">' + esc(T.label) + (equip ? ' — ' + esc(equip) : '') + '</span>' +
      '<span class="diag-item__meta">' + DM.ui.chip(S.label, S.cls) +
      (d.verdict && d.verdict.status !== 'non_confirme' && d.status !== 'cloture'
        ? DM.ui.chip(DM.VERDICT_STATUS[d.verdict.status].label.replace('Diagnostic ', ''), DM.VERDICT_STATUS[d.verdict.status].cls) : '') +
      '<span class="small muted">' + icon('calendar') + esc(DM.fmtDate(d.date)) + '</span>' +
      '<span class="small muted">' + icon('branch') + st.hypotheses + '</span>' +
      '<span class="small muted">' + icon('meter') + st.done + '/' + st.controls + '</span>' +
      (st.photos ? '<span class="small muted">' + icon('camera') + st.photos + '</span>' : '') +
      '</span></span>' + icon('chevron', 'diag-item__chev') + '</a>' +
      (withActions ? '<div class="diag-item__actions">' +
        '<a class="btn btn--sm btn--ghost" href="#/diag/' + encodeURIComponent(d.id) + '">' + icon('file') + 'Ouvrir</a>' +
        '<a class="btn btn--sm btn--ghost" href="#/diag/' + encodeURIComponent(d.id) + '/modifier">' + icon('edit') + 'Modifier</a>' +
        '<button type="button" class="btn btn--sm btn--ghost" data-action="duplicate" data-id="' + esc(d.id) + '">' + icon('copy') + 'Dupliquer</button>' +
        '<button type="button" class="btn btn--sm btn--danger-ghost" data-action="delete" data-id="' + esc(d.id) + '">' + icon('trash') + 'Supprimer</button>' +
        '</div>' : '') +
      '</article>';
  };

  DM.ui.notFound = function (what) {
    return {
      title: 'Introuvable', back: '#/historique',
      html: '<div class="empty">' + icon('alert') + '<h2>' + esc(what || 'Diagnostic introuvable') + '</h2>' +
        '<p class="muted">Il a peut-être été supprimé.</p><a class="btn btn--primary" href="#/historique">Voir l’historique</a></div>'
    };
  };

  /* ---------- routeur ---------- */
  const app = DM.app = { current: null };

  function parse() {
    const path = (location.hash || '').replace(/^#/, '') || '/';
    for (let i = 0; i < ROUTES.length; i++) {
      const m = path.match(ROUTES[i][0]);
      if (m) return { name: ROUTES[i][1], params: { id: m[1] ? decodeURIComponent(m[1]) : null }, path: path };
    }
    return { name: 'home', params: {}, path: '/' };
  }

  function renderTopbar(out) {
    const s = DM.store.settings();
    document.getElementById('topbar').innerHTML =
      '<div class="topbar__inner">' +
      (out.back ? '<a class="btn btn--icon btn--flat" href="' + esc(out.back) + '" aria-label="Retour">' + icon('back') + '</a>'
        : '<a class="topbar__logo" href="#/" aria-label="Accueil">' + icon('bolt') + '</a>') +
      '<h1 class="topbar__title">' + esc(out.title || 'DIAG-MAINT') + '</h1>' +
      '<div class="topbar__actions">' + (out.actions || '') +
      '<button type="button" id="theme-btn" class="btn btn--icon btn--flat" data-action="theme-toggle"></button></div></div>';
    DM.applyTheme(s.theme);
  }

  function renderNav(name, params) {
    const items = [
      ['home', '#/', 'home', 'Accueil'],
      ['new', '#/', 'plus', 'Nouveau', 'new-diag'],
      ['history', '#/historique', 'history', 'Historique'],
      ['knowledge', '#/connaissances', 'book', 'Savoir'],
      ['settings', '#/parametres', 'settings', 'Réglages']
    ];
    let active = name;
    if (name === 'agent' || name === 'diag' || name === 'report' || (name === 'form' && params.id)) active = 'history';
    if (name === 'documents') active = 'knowledge';
    if (name === 'form' && !params.id) active = 'new';
    document.getElementById('bottomnav').innerHTML = items.map(function (it) {
      return '<a href="' + it[1] + '"' + (it[4] ? ' data-action="' + it[4] + '"' : '') + ' class="bottomnav__item' + (it[0] === active ? ' is-active' : '') + '"' +
        (it[0] === active ? ' aria-current="page"' : '') + '>' + icon(it[2]) + '<span>' + it[3] + '</span></a>';
    }).join('');
  }

  app.render = function (keepScroll) {
    const r = parse();
    const view = DM.views[r.name];
    const y = window.scrollY;
    if (app.current && app.current.view.unmount) app.current.view.unmount();
    let out;
    try { out = view.render(r.params); }
    catch (e) {
      console.error(e);
      out = { title: 'Erreur', html: '<div class="empty">' + icon('alert') + '<h2>Une erreur est survenue</h2><p class="muted">' + esc(e.message) + '</p><a class="btn btn--primary" href="#/">Accueil</a></div>' };
    }
    app.current = { name: r.name, view: view, params: r.params };
    document.title = out.title && out.title !== 'DIAG-MAINT' ? out.title + ' · DIAG-MAINT' : 'DIAG-MAINT';
    renderTopbar(out);
    renderNav(r.name, r.params);
    const main = document.getElementById('app');
    main.className = 'app view-' + r.name;
    main.innerHTML = out.html;
    document.getElementById('fab-root').innerHTML = out.fab || '';
    if (view.mount) {
      try { view.mount(main, r.params); } catch (e) { console.error(e); DM.ui.toast(e.message, 'error'); }
    }
    window.scrollTo(0, keepScroll ? y : 0);
  };
  app.refresh = function () { app.render(true); };
  app.go = function (path) {
    if ((location.hash || '#/') === '#' + path) app.render(); else location.hash = path;
  };

  const globalActions = {
    'new-diag': function () { DM.ops.newAgentDiag(); },
    'theme-toggle': function () {
      const cur = DM.store.settings().theme;
      const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
      DM.store.saveSettings({ theme: next });
      DM.applyTheme(next);
      DM.ui.toast(THEME_LABEL[next]);
    }
  };

  document.addEventListener('click', function (e) {
    const el = e.target.closest('[data-action]');
    if (!el || el.closest('#modal-root')) return;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    const name = el.dataset.action;
    const actions = (app.current && app.current.view.actions) || {};
    const fn = actions[name] || globalActions[name];
    if (!fn) return;
    e.preventDefault();
    Promise.resolve()
      .then(function () { return fn(el, e, app.current.params); })
      .catch(function (err) { console.error(err); DM.ui.toast(err.message || String(err), 'error'); });
  });

  window.addEventListener('hashchange', function () { app.render(); });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { DM.applyTheme(DM.store.settings().theme); });

  document.addEventListener('DOMContentLoaded', function () {
    app.render();
    if (!DM.store.persistent) DM.ui.toast('Stockage local indisponible : les données ne seront pas conservées.', 'error');
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('Service worker non enregistré', e); });
    }
    // état du serveur IA + envoi des diagnostics en attente de synchronisation
    if (DM.agentClient) DM.agentClient.health().then(function () { if (DM.sync) DM.sync.flush(); });
  });
})(window.DM);
