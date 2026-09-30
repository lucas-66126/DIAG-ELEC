/* DIAG-MAINT — écran d'accueil */
(function (DM) {
  'use strict';
  const icon = DM.icon, esc = DM.esc;

  function engineHtml() {
    const h = DM.agentClient.lastHealth();
    const mode = DM.store.settings().agentMode;
    if (mode === 'local') return '<span class="engine-dot">Local</span> Moteur local (réglage)';
    if (!h.at) return '<span class="engine-dot">…</span> Vérification du serveur IA…';
    if (h.data && !h.error) {
      const p = h.data.provider || {};
      if (p.name === 'local') return '<span class="engine-dot">Local</span> Serveur connecté, sans clé d’IA : moteur local';
      return '<span class="engine-dot is-on">IA</span> Agent IA en ligne' + (p.model ? ' · ' + esc(p.model) : '') + (p.webSearch ? ' · recherche Web' : '');
    }
    return '<span class="engine-dot">Local</span> ' + esc(h.error || 'Hors ligne') + ' — moteur local (sans IA)';
  }

  DM.views.home = {
    render: function () {
      const all = DM.store.all();
      const open = all.filter(function (d) { return d.status !== 'cloture'; });
      const doneControls = all.reduce(function (n, d) { return n + d.controls.filter(DM.hasResult).length; }, 0);
      const steps = [['eye', 'Observer'], ['meter', 'Mesurer'], ['branch', 'Analyser'], ['play', 'Tester'], ['check', 'Confirmer'], ['wrench', 'Réparer']];

      return {
        title: 'DIAG-MAINT',
        html:
          '<section class="hero">' +
            '<div class="hero__brand"><span class="hero__logo">' + icon('bolt') + '</span>' +
            '<div><h2>DIAG-MAINT</h2><p>Ton technicien expérimenté, à côté de toi</p></div></div>' +
            '<button type="button" class="btn btn--primary btn--xl btn--block" data-action="new-diag">' + icon('plus') + 'Nouveau diagnostic</button>' +
            '<p class="hero__engine small" id="engine-status">' + engineHtml() + '</p>' +
            '<div class="btnrow">' +
              '<a class="btn btn--ghost" href="#/historique">' + icon('history') + 'Historique</a>' +
              '<a class="btn btn--ghost" href="#/connaissances">' + icon('book') + 'Savoir</a>' +
              '<a class="btn btn--ghost" href="#/nouveau">' + icon('list') + 'Formulaire</a>' +
            '</div>' +
          '</section>' +
          '<div class="stats">' +
            '<div class="stat"><b>' + open.length + '</b><span>en cours</span></div>' +
            '<div class="stat"><b>' + (all.length - open.length) + '</b><span>clôturés</span></div>' +
            '<div class="stat"><b>' + doneControls + '</b><span>contrôles réalisés</span></div>' +
          '</div>' +
          (open.length ? '<h3 class="section-title">' + icon('wrench') + 'Diagnostics en cours</h3><div class="list">' +
            open.slice(0, 5).map(function (d) { return DM.ui.diagItem(d, false); }).join('') + '</div>' : '') +
          '<div class="card method"><h3 class="card__title">' + icon('branch') + 'La démarche</h3><ol class="method__steps">' +
            steps.map(function (s) { return '<li>' + icon(s[0]) + '<span>' + s[1] + '</span></li>'; }).join('') +
          '</ol><p class="small muted">L’agent pose une question à la fois, propose le contrôle le plus simple et le plus sûr, et ne confirme jamais une cause sans résultat de contrôle.</p></div>' +
          '<div class="card card--safety"><span class="card--safety__icon">' + icon('shield') + '</span><div>' +
            '<strong>Sécurité avant tout</strong>' +
            '<p class="small">Consignez avant tout contrôle hors tension : séparer, condamner, identifier, vérifier l’absence de tension (VAT). ' +
            'Les mesures sous tension sont réservées au personnel habilité, équipé des EPI adaptés. Ne shuntez jamais une sécurité.</p></div></div>'
      };
    },
    mount: function (root) {
      DM.agentClient.health().then(function () {
        const el = root.querySelector('#engine-status');
        if (el) el.innerHTML = engineHtml();
      });
    }
  };
})(window.DM);
