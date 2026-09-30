/* DIAG-MAINT — compte-rendu imprimable / partageable */
(function (DM) {
  'use strict';
  const esc = DM.esc, nl2br = DM.nl2br, icon = DM.icon, ui = DM.ui;

  function block(n, title, content) {
    return '<section class="rp-section"><h3><span class="rp-num">' + n + '</span>' + title + '</h3>' + content + '</section>';
  }
  function text(v) { return v ? '<p>' + nl2br(v) + '</p>' : '<p class="muted">—</p>'; }

  function copyText(t) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t);
    return new Promise(function (resolve, reject) {
      const ta = document.createElement('textarea');
      ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove();
      if (ok) resolve(); else reject(new Error('Copie impossible'));
    });
  }

  DM.views.report = {
    render: function (params) {
      const d = DM.store.get(params.id);
      if (!d) return ui.notFound();
      const r = DM.buildReport(d, DM.store.settings());
      const idq = encodeURIComponent(d.id);

      const controls = r.controls.length ? '<div class="rp-controls">' + r.controls.map(function (c, i) {
        return '<div class="rp-control"><div class="rp-control__head"><b>' + (i + 1) + '.</b> ' + esc(c.description) + '</div>' +
          '<table class="rp-table"><tbody>' +
          '<tr><th>Hypothèse</th><td>' + esc(c.hypothesis) + '</td></tr>' +
          '<tr><th>Nature</th><td>' + esc(c.type) + '</td></tr>' +
          (c.expected ? '<tr><th>Attendu</th><td>' + esc(c.expected) + '</td></tr>' : '') +
          '<tr><th>Obtenu</th><td>' + nl2br(c.obtained) + (c.measure ? ' <b class="measure">(' + esc(c.measure) + ')</b>' : '') + '</td></tr>' +
          '<tr><th>Verdict</th><td>' + ui.chip(c.verdict, c.verdictCls) + (c.conclusion ? ' ' + esc(c.conclusion) : '') + '</td></tr>' +
          '</tbody></table></div>';
      }).join('') + '</div>' : '<p class="muted">Aucun contrôle réalisé.</p>';

      const measures = r.measures.length ? '<table class="rp-table rp-table--grid"><thead><tr><th>Point de mesure</th><th>Valeur</th><th>Attendu</th></tr></thead><tbody>' +
        r.measures.map(function (m) { return '<tr><td>' + esc(m.label) + '</td><td class="measure">' + esc(m.value) + '</td><td>' + esc(m.expected || '—') + '</td></tr>'; }).join('') +
        '</tbody></table>' : '<p class="muted">Aucune mesure relevée.</p>';

      const hyps = r.hypotheses.length ? '<ul class="rp-hyps">' + r.hypotheses.map(function (h) {
        return '<li>' + ui.chip(h.state, h.stateCls) + ' <b>' + esc(h.cause) + '</b>' + (h.conclusion ? ' — ' + esc(h.conclusion) : '') + '</li>';
      }).join('') + '</ul>' : '';

      const diagnosis = (r.isConfirmed ? '' : '<div class="notice notice--warning">' + icon('alert') + '<div>Aucune hypothèse confirmée par un contrôle : diagnostic non établi.</div></div>') +
        (r.confirmed.length ? '<p><span class="muted">Cause(s) confirmée(s) :</span> <b>' + r.confirmed.map(esc).join(' ; ') + '</b></p>' : '') +
        text(r.diagnosis) + (hyps ? '<h4>Hypothèses étudiées</h4>' + hyps : '');

      return {
        title: 'Compte-rendu',
        back: '#/diag/' + idq,
        html:
          '<div class="report-tools no-print">' +
            '<button type="button" class="btn btn--primary" data-action="print">' + icon('print') + 'Imprimer / PDF</button>' +
            '<button type="button" class="btn btn--ghost" data-action="share">' + icon('share') + 'Partager</button>' +
            '<button type="button" class="btn btn--ghost" data-action="copy">' + icon('copy') + 'Copier</button>' +
            '<button type="button" class="btn btn--ghost" data-action="txt">' + icon('download') + '.txt</button>' +
          '</div>' +
          (r.technician ? '' : '<p class="small muted no-print">Astuce : renseignez votre nom dans <a href="#/parametres">Réglages</a> pour qu’il apparaisse sur le compte-rendu.</p>') +
          '<article class="report" id="report">' +
            '<header class="rp-head"><div class="rp-brand">' + icon('bolt') + '<div><strong>DIAG-MAINT</strong><span>Compte-rendu de diagnostic</span></div></div>' +
              '<div class="rp-meta"><div><span>N°</span><b>' + esc(r.number) + '</b></div><div><span>Date</span><b>' + esc(DM.fmtDate(r.date)) + '</b></div>' +
              '<div><span>Statut</span><b>' + esc(r.status) + '</b></div>' +
              (r.technician ? '<div><span>Technicien</span><b>' + esc(r.technician) + '</b></div>' : '') +
              (r.company ? '<div><span>Entreprise</span><b>' + esc(r.company) + '</b></div>' : '') + '</div></header>' +
            '<h2 class="rp-title">' + esc(r.title) + '</h2>' +
            block(1, 'Matériel', '<table class="rp-table"><tbody>' + r.equipment.map(function (e) { return '<tr><th>' + esc(e[0]) + '</th><td>' + esc(e[1]) + '</td></tr>'; }).join('') + '</tbody></table>') +
            block(2, 'Panne constatée', text(r.description)) +
            block(3, 'Symptômes', r.symptoms.length ? '<ul>' + r.symptoms.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' : '<p class="muted">—</p>') +
            block(4, 'Contrôles réalisés', controls + (r.pendingControls ? '<p class="small muted">' + DM.plural(r.pendingControls, 'contrôle prévu non réalisé', 'contrôles prévus non réalisés') + '.</p>' : '')) +
            block(5, 'Mesures', measures) +
            block(6, 'Diagnostic', diagnosis) +
            block(7, 'Réparation effectuée', text(r.repair)) +
            block(8, 'Recommandations', text(r.recommendations)) +
            (r.photoCount ? block(9, 'Photos', ui.photoGallery(d.photos, { readonly: true }).replace(/data-action="photo-view"/g, 'data-action="photo-open"')) : '') +
            '<footer class="rp-foot"><div class="rp-sign"><span>Visa technicien</span></div><div class="rp-sign"><span>Visa client / exploitant</span></div></footer>' +
            '<p class="small muted center">Généré le ' + esc(DM.fmtDateTime(r.generatedAt)) + ' avec DIAG-MAINT</p>' +
          '</article>'
      };
    },
    mount: function (root) { ui.hydratePhotos(root); },
    actions: {
      'print': function () { window.print(); },
      'copy': function (el, e, p) {
        const t = DM.reportToText(DM.buildReport(DM.store.get(p.id), DM.store.settings()));
        return copyText(t).then(function () { ui.toast('Compte-rendu copié', 'success'); });
      },
      'share': function (el, e, p) {
        const d = DM.store.get(p.id);
        const t = DM.reportToText(DM.buildReport(d, DM.store.settings()));
        if (navigator.share) {
          return navigator.share({ title: 'Compte-rendu ' + d.name, text: t }).catch(function (err) {
            if (err && err.name !== 'AbortError') throw err;
          });
        }
        return copyText(t).then(function () { ui.toast('Partage non disponible : texte copié dans le presse-papiers', 'success'); });
      },
      'txt': function (el, e, p) {
        const d = DM.store.get(p.id);
        const t = DM.reportToText(DM.buildReport(d, DM.store.settings()));
        DM.download('compte-rendu-' + DM.reportNumber(d) + '.txt', t, 'text/plain;charset=utf-8');
      },
      'photo-open': function (el, e, p) {
        const d = DM.store.get(p.id);
        const ph = d.photos.find(function (x) { return x.id === el.dataset.photo; });
        if (ph) return ui.viewPhoto(ph, true);
      }
    }
  };
})(window.DM);
