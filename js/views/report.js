/* DIAG-MAINT — compte-rendu imprimable / exportable en PDF / partageable */
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
      let n = 0;
      const sec = function (title, content) { return block(++n, title, content); };

      const controls = r.controls.length ? '<div class="rp-controls">' + r.controls.map(function (c, i) {
        return '<div class="rp-control"><div class="rp-control__head"><b>' + (i + 1) + '.</b> ' + esc(c.description) + '</div>' +
          '<table class="rp-table"><tbody>' +
          '<tr><th>Hypothèse</th><td>' + esc(c.hypothesis) + '</td></tr>' +
          '<tr><th>Nature</th><td>' + esc(c.type) + ' · risque N' + c.risk + '</td></tr>' +
          (c.expected ? '<tr><th>Attendu</th><td>' + esc(c.expected) + '</td></tr>' : '') +
          '<tr><th>Obtenu</th><td>' + nl2br(c.obtained) + (c.measure ? ' <b class="measure">(' + esc(c.measure) + ')</b>' : '') + '</td></tr>' +
          '<tr><th>Verdict</th><td>' + ui.chip(c.verdict, c.verdictCls) + (c.conclusion ? ' ' + esc(c.conclusion) : '') + '</td></tr>' +
          (c.safetyDeclared ? '<tr><th>Sécurité</th><td class="small">Consignes non validées formellement dans l’application (résultat rapporté dans la conversation).</td></tr>' : '') +
          '</tbody></table></div>';
      }).join('') + '</div>' : '<p class="muted">Aucun contrôle réalisé.</p>';

      const measures = r.measures.length ? '<table class="rp-table rp-table--grid"><thead><tr><th>Date / heure</th><th>Mesure</th><th>Valeur</th><th>Emplacement</th><th>Résultat</th></tr></thead><tbody>' +
        r.measures.map(function (m) {
          return '<tr><td class="nowrap">' + esc(DM.fmtDateTime(m.at)) + '</td><td>' + esc(m.label) + (m.control ? '<br><small class="muted">' + esc(m.control) + '</small>' : '') + '</td>' +
            '<td class="measure">' + esc(m.value) + '</td><td>' + esc(m.location || '—') + '</td><td>' + (m.result ? ui.chip(m.result, m.resultCls) : '—') + '</td></tr>';
        }).join('') + '</tbody></table>' : '<p class="muted">Aucune mesure relevée.</p>';

      const hyps = r.hypotheses.length ? '<ul class="rp-hyps">' + r.hypotheses.map(function (h) {
        return '<li>' + ui.chip(h.state, h.stateCls) + ' <b>' + esc(h.cause) + '</b>' + (h.conclusion ? ' — ' + esc(h.conclusion) : '') +
          (h.evidence.length ? '<ul class="ev ev--pro">' + h.evidence.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>' : '') +
          (h.counterEvidence.length ? '<ul class="ev ev--con">' + h.counterEvidence.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>' : '') + '</li>';
      }).join('') + '</ul>' : '';

      const diagnosis = '<div class="verdict verdict--' + r.verdict.cls + '"><div><strong>' + esc(r.verdict.label) + '</strong>' +
          (r.verdict.missing.length ? '<p class="small">Éléments manquants : ' + r.verdict.missing.map(esc).join(' ; ') + '</p>' : '') + '</div></div>' +
        (r.isConfirmed ? '' : '<div class="notice notice--warning">' + icon('alert') + '<div>Aucune hypothèse confirmée par un contrôle : diagnostic non établi.</div></div>') +
        (r.confirmed.length ? '<p><span class="muted">Cause(s) confirmée(s) :</span> <b>' + r.confirmed.map(esc).join(' ; ') + '</b></p>' : '') +
        text(r.diagnosis) + (hyps ? '<h4>Hypothèses étudiées</h4>' + hyps : '');

      const parts = r.parts.length ? '<table class="rp-table rp-table--grid"><thead><tr><th>Qté</th><th>Désignation</th><th>Référence</th></tr></thead><tbody>' +
        r.parts.map(function (p) { return '<tr><td>' + esc(p.quantity) + '</td><td>' + esc(p.designation) + '</td><td>' + esc(p.reference || '—') + '</td></tr>'; }).join('') +
        '</tbody></table>' : '<p class="muted">—</p>';

      const photos = r.photos.length ? '<div class="photo-grid rp-photos">' + r.photos.map(function (p) {
        return '<figure><button type="button" class="photo-thumb" data-action="photo-open" data-photo="' + esc(p.id) + '"><img data-photo-id="' + esc(p.id) + '" alt="' + esc(p.kind) + '"></button>' +
          '<figcaption class="small">' + esc(p.kind) + (p.caption ? ' — ' + esc(p.caption) : '') + '</figcaption></figure>';
      }).join('') + '</div>' : '<p class="muted">Aucune photo.</p>';

      return {
        title: 'Rapport',
        back: '#/diag/' + idq,
        html:
          '<div class="report-tools no-print">' +
            '<button type="button" class="btn btn--primary" data-action="print">' + icon('print') + 'Exporter en PDF</button>' +
            '<button type="button" class="btn btn--ghost" data-action="share">' + icon('share') + 'Partager</button>' +
            '<button type="button" class="btn btn--ghost" data-action="copy">' + icon('copy') + 'Copier</button>' +
            '<button type="button" class="btn btn--ghost" data-action="txt">' + icon('download') + '.txt</button>' +
          '</div>' +
          '<p class="small muted no-print">« Exporter en PDF » ouvre l’impression : choisis « Enregistrer au format PDF ».' +
            (r.technician ? '' : ' Renseigne ton nom dans <a href="#/parametres">Réglages</a> pour qu’il apparaisse.') + '</p>' +
          '<article class="report" id="report">' +
            '<header class="rp-head"><div class="rp-brand">' + icon('bolt') + '<div><strong>DIAG-MAINT</strong><span>Rapport d’intervention</span></div></div>' +
              '<div class="rp-meta">' +
                '<div><span>N°</span><b>' + esc(r.number) + '</b></div>' +
                '<div><span>Date</span><b>' + esc(DM.fmtDate(r.date)) + '</b></div>' +
                (r.client ? '<div><span>Client</span><b>' + esc(r.client) + '</b></div>' : '') +
                (r.site ? '<div><span>Site</span><b>' + esc(r.site) + '</b></div>' : '') +
                (r.technician ? '<div><span>Technicien</span><b>' + esc(r.technician) + '</b></div>' : '') +
                (r.company ? '<div><span>Entreprise</span><b>' + esc(r.company) + '</b></div>' : '') +
                '<div><span>Statut</span><b>' + esc(r.status) + '</b></div>' +
              '</div></header>' +
            '<h2 class="rp-title">' + esc(r.title) + '</h2>' +
            sec('Équipement', '<table class="rp-table"><tbody>' + r.equipment.map(function (e) { return '<tr><th>' + esc(e[0]) + '</th><td>' + esc(e[1]) + '</td></tr>'; }).join('') + '</tbody></table>') +
            sec('Panne', text(r.description)) +
            sec('Symptômes', (r.symptoms.length ? '<ul>' + r.symptoms.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' : '<p class="muted">—</p>') +
              (r.facts.length ? '<h4>Informations recueillies</h4><ul class="rp-facts">' + r.facts.map(function (f) { return '<li><span class="muted">' + esc(f.question) + '</span> → ' + esc(f.answer) + '</li>'; }).join('') + '</ul>' : '')) +
            sec('Photos', photos) +
            sec('Contrôles', controls + (r.pendingControls ? '<p class="small muted">' + DM.plural(r.pendingControls, 'contrôle prévu non réalisé', 'contrôles prévus non réalisés') + '.</p>' : '')) +
            sec('Mesures', measures) +
            sec('Diagnostic', diagnosis) +
            sec('Réparation', text(r.repair)) +
            sec('Pièces utilisées', parts) +
            sec('Recommandations', text(r.recommendations)) +
            sec('Résultat final', r.finalResult ? '<p><b>' + esc(r.finalResult) + '</b></p>' : '<p class="muted">—</p>') +
            (r.documents.length ? sec('Documentation consultée', '<ul>' + r.documents.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>') : '') +
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
        return copyText(t).then(function () { ui.toast('Rapport copié', 'success'); });
      },
      'share': function (el, e, p) {
        const d = DM.store.get(p.id);
        const t = DM.reportToText(DM.buildReport(d, DM.store.settings()));
        if (navigator.share) {
          return navigator.share({ title: 'Rapport ' + d.name, text: t }).catch(function (err) {
            if (err && err.name !== 'AbortError') throw err;
          });
        }
        return copyText(t).then(function () { ui.toast('Partage non disponible : texte copié dans le presse-papiers', 'success'); });
      },
      'txt': function (el, e, p) {
        const d = DM.store.get(p.id);
        DM.download('rapport-' + DM.reportNumber(d) + '.txt', DM.reportToText(DM.buildReport(d, DM.store.settings())), 'text/plain;charset=utf-8');
      },
      'photo-open': function (el, e, p) {
        const d = DM.store.get(p.id);
        const ph = d.photos.find(function (x) { return x.id === el.dataset.photo; });
        if (ph) return ui.viewPhoto(ph, true);
      }
    }
  };
})(window.DM);
