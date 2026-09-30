/* DIAG-MAINT — écran d'accueil */
(function (DM) {
  'use strict';
  const icon = DM.icon;

  DM.views.home = {
    render: function () {
      const all = DM.store.all();
      const open = all.filter(function (d) { return d.status !== 'cloture'; });
      const doneControls = all.reduce(function (n, d) { return n + d.controls.filter(DM.hasResult).length; }, 0);
      const steps = [['symptom', 'Symptôme'], ['branch', 'Hypothèse'], ['meter', 'Contrôle'], ['check', 'Résultat'], ['target', 'Diagnostic']];

      return {
        title: 'DIAG-MAINT',
        html:
          '<section class="hero">' +
            '<div class="hero__brand"><span class="hero__logo">' + icon('bolt') + '</span>' +
            '<div><h2>DIAG-MAINT</h2><p>Assistant de diagnostic pour la maintenance</p></div></div>' +
            '<a class="btn btn--primary btn--xl btn--block" href="#/nouveau">' + icon('plus') + 'Nouveau diagnostic</a>' +
            '<a class="btn btn--ghost btn--lg btn--block" href="#/historique">' + icon('history') + 'Historique des diagnostics</a>' +
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
          '</ol><p class="small muted">Une hypothèse n’est jamais considérée comme certaine sans résultat de contrôle.</p></div>' +
          '<div class="card card--safety"><span class="card--safety__icon">' + icon('shield') + '</span><div>' +
            '<strong>Sécurité avant tout</strong>' +
            '<p class="small">Consignez avant tout contrôle hors tension : séparer, condamner, identifier, vérifier l’absence de tension (VAT). ' +
            'Les mesures sous tension sont réservées au personnel habilité, équipé des EPI adaptés.</p></div></div>'
      };
    }
  };
})(window.DM);
