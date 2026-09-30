/* DIAG-MAINT — base de connaissances : recherche dans les diagnostics terminés (appareil + serveur). */
(function (DM) {
  'use strict';
  const esc = DM.esc, icon = DM.icon;
  const q = { mode: 'similaire', text: '' };

  function resultHtml(r, source) {
    const e = r.entry;
    return '<article class="kb-item">' +
      '<div class="kb-item__head"><strong>' + esc(e.title) + '</strong><span class="small muted">' + esc(DM.fmtDate(e.date)) + (source === 'serveur' ? ' · serveur' : '') + '</span></div>' +
      '<p class="small">' + esc([e.brand, e.model, e.reference].filter(Boolean).join(' · ') || DM.installType(e.installationType).label) + '</p>' +
      (e.symptoms.length ? '<p class="small"><span class="muted">Symptômes :</span> ' + esc(e.symptoms.join(' ; ')) + '</p>' : '') +
      (e.errorCodes.length ? '<p class="small"><span class="muted">Codes :</span> ' + esc(e.errorCodes.join(', ')) + '</p>' : '') +
      (e.cause ? '<p class="small"><span class="muted">Cause :</span> <b>' + esc(e.cause) + '</b></p>' : '') +
      (e.repair ? '<p class="small"><span class="muted">Réparation :</span> ' + esc(e.repair) + '</p>' : '') +
      '<div class="kb-item__foot"><span class="small match">' + icon('tag') + esc(r.why.join(', ')) + '</span>' +
      (source !== 'serveur' && DM.store.get(e.diagId) ? '<a class="btn btn--sm btn--ghost" href="#/diag/' + encodeURIComponent(e.diagId) + '">Ouvrir</a>' : '') + '</div>' +
      '</article>';
  }

  function search(root) {
    const box = root.querySelector('#kb-results');
    const entries = DM.kb.fromDiagnostics(DM.store.all());
    const params = { mode: q.mode, text: q.text, reference: q.mode === 'reference' ? q.text : '', code: q.mode === 'code' ? q.text : '', symptom: q.mode === 'symptome' ? q.text : '' };
    if (!q.text.trim()) {
      box.innerHTML = entries.length
        ? '<p class="small muted">' + DM.plural(entries.length, 'diagnostic abouti') + ' sur cet appareil. Saisis une référence, un code défaut ou un symptôme.</p>'
        : '<div class="empty empty--sm">' + icon('book') + '<p>La base se remplit automatiquement avec tes diagnostics clôturés ou dont la cause est identifiée.</p></div>';
      return;
    }
    const local = DM.kb.search(entries, params);
    box.innerHTML = (local.length ? local.map(function (r) { return resultHtml(r, 'appareil'); }).join('') : '<p class="small muted">Aucun résultat sur cet appareil.</p>') +
      '<div id="kb-server"></div>';
    DM.agentClient.health().then(function (h) {
      if (!h.data || h.error) return;
      return DM.agentClient.searchKnowledge(params).then(function (res) {
        const seen = local.map(function (r) { return r.entry.diagId; });
        const extra = (res.results || []).filter(function (r) { return seen.indexOf(r.entry.diagId) === -1; });
        const el = root.querySelector('#kb-server');
        if (el && extra.length) el.innerHTML = '<h3 class="section-title">' + icon('cloud') + 'Sur le serveur</h3>' + extra.map(function (r) { return resultHtml(r, 'serveur'); }).join('');
      });
    }).catch(function () { /* recherche serveur facultative */ });
  }

  DM.views.knowledge = {
    render: function () {
      return {
        title: 'Savoir',
        html:
          '<div class="seg" role="tablist"><a class="seg__btn is-on" role="tab" aria-selected="true" href="#/connaissances">' + icon('history') + 'Diagnostics</a>' +
          '<a class="seg__btn" role="tab" aria-selected="false" href="#/documents">' + icon('file') + 'Documentation</a></div>' +
          '<div class="toolbar">' +
            '<div class="seg seg--sm" role="group" aria-label="Type de recherche">' + Object.keys(DM.KB_MODES).map(function (k) {
              return '<button type="button" class="seg__btn' + (q.mode === k ? ' is-on' : '') + '" data-action="kb-mode" data-v="' + k + '" aria-pressed="' + (q.mode === k) + '">' + esc(DM.KB_MODES[k]) + '</button>';
            }).join('') + '</div>' +
            '<label class="search">' + icon('search') + '<input type="search" id="kb-q" value="' + esc(q.text) + '" placeholder="' +
              esc({ similaire: 'Décris la panne…', reference: 'Référence, ex. MUZ-LN35VG', code: 'Code défaut, ex. E6', symptome: 'Symptôme, ex. disjoncteur déclenche' }[q.mode]) + '" aria-label="Recherche"></label>' +
          '</div>' +
          '<div id="kb-results" class="list"></div>'
      };
    },
    mount: function (root) {
      const input = root.querySelector('#kb-q');
      let t = null;
      input.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { q.text = input.value; search(root); }, 250); });
      search(root);
    },
    actions: {
      'kb-mode': function (el) { q.mode = el.dataset.v; DM.app.refresh(); }
    }
  };
})(window.DM);
