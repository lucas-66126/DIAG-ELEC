/* DIAG-MAINT — écran principal : conversation avec l'agent + panneau « État du diagnostic » (mode terrain). */
(function (DM) {
  'use strict';
  const esc = DM.esc, icon = DM.icon, ui = DM.ui;

  const GREETING = 'Décris-moi la panne. Tu peux également ajouter une photo.';
  const TRACE_ICON = { web: 'search', documentation: 'file', photo: 'camera', measurement: 'meter', knowledge: 'history',
    control: 'play', result: 'check', hypothesis: 'branch', verdict: 'target', equipment: 'tag' };
  const state = { busy: false, since: 0, timer: null, panel: false, engine: null };

  /* ---------- utilitaires ---------- */
  function load(id) { const d = DM.store.get(id); if (!d) throw new Error('Diagnostic introuvable.'); return d; }
  function save(d) { DM.store.save(d); }

  /** Markdown minimal et sûr (texte échappé d'abord) : **gras**, *italique*, listes, liens http(s). */
  ui.md = function (text) {
    const lines = esc(text).split('\n');
    let html = '', list = false;
    lines.forEach(function (l) {
      let t = l.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
      const li = t.match(/^\s*(?:[-•]|\d+[.)])\s+(.*)$/);
      if (li) { if (!list) { html += '<ul>'; list = true; } html += '<li>' + li[1] + '</li>'; return; }
      if (list) { html += '</ul>'; list = false; }
      if (/⚠️|RISQUE/.test(t)) t = '<span class="risk-line">' + t + '</span>';
      html += t ? '<p>' + t + '</p>' : '';
    });
    if (list) html += '</ul>';
    return html;
  };

  /* ---------- rendu des messages ---------- */
  function traceHtml(trace) {
    if (!trace || !trace.length) return '';
    return '<div class="trace">' + trace.map(function (t) {
      return '<div class="trace__item trace--' + esc(t.kind) + '">' + icon(TRACE_ICON[t.kind] || 'info') +
        '<span><b>' + esc(t.label) + '</b>' + (t.detail ? ' · ' + esc(t.detail) : '') + (t.error ? ' · erreur ' + esc(t.error) : '') +
        (t.sources && t.sources.length ? '<span class="trace__sources">' + t.sources.map(function (s) {
          return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.title || s.url) + '</a>';
        }).join('') + '</span>' : '') + '</span></div>';
    }).join('') + '</div>';
  }

  function riskBanner(d, c, withAck) {
    const r = DM.riskLevel(c, d.installationType);
    if (r.level < 2) return '<div class="risk-ok">' + icon('shield') + ' ' + esc(r.label) + '</div>';
    return '<div class="risk-banner risk-banner--' + r.cls + '" role="alert">' +
      '<div class="risk-banner__title">' + icon(r.level >= 3 ? 'bolt' : 'alert') + '<strong>RISQUE</strong><span>' + esc(r.label) + '</span></div>' +
      '<ul>' + r.precautions.slice(0, 3).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' +
      (r.precautions.length > 3 ? '<details class="small"><summary>Toutes les précautions (' + r.precautions.length + ')</summary><ul>' +
        r.precautions.slice(3).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul></details>' : '') +
      (withAck ? (c.safetyAck ? '<p class="risk-banner__ack">' + icon('check') + 'Consignes validées</p>'
        : '<button type="button" class="btn btn--sm btn--warning" data-action="ack" data-id="' + c.id + '">' + icon('shield') + 'J’ai appliqué les consignes</button>') : '') +
      '</div>';
  }

  function controlCard(d, c) {
    const T = DM.CONTROL_TYPES[c.type];
    const h = c.hypothesisId ? DM.findHyp(d, c.hypothesisId) : null;
    const n = d.controls.indexOf(c) + 1;
    return '<div class="ctl-card">' +
      '<div class="ctl-card__head">' + ui.typeBadge(c.type) + '<span class="small muted">Contrôle n°' + n + (h ? ' · ' + esc(h.cause) : '') + '</span></div>' +
      '<p class="ctl-card__desc">' + esc(c.description) + '</p>' +
      (c.why ? '<p class="small"><span class="muted">Pourquoi :</span> ' + esc(c.why) + '</p>' : '') +
      (c.expected ? '<p class="small"><span class="muted">Attendu :</span> ' + esc(c.expected) + '</p>' : '') +
      (c.location ? '<p class="small"><span class="muted">Emplacement :</span> ' + esc(c.location) + '</p>' : '') +
      riskBanner(d, c, true) +
      '<div class="btnrow">' +
        '<button type="button" class="btn btn--sm btn--primary" data-action="measure" data-control="' + c.id + '">' + icon('meter') + 'Saisir une mesure</button>' +
        '<button type="button" class="btn btn--sm btn--ghost" data-action="control-done" data-id="' + c.id + '">' + icon('check') + 'Contrôle effectué</button>' +
      '</div>' + (T ? '' : '') + '</div>';
  }

  function attachmentHtml(d, a) {
    if (a.type === 'photo') return '<button type="button" class="chat-photo" data-action="photo-view" data-photo="' + esc(a.id) + '"><img data-photo-id="' + esc(a.id) + '" alt="Photo"></button>';
    if (a.type === 'measurement') {
      const m = DM.findMeasurement(d, a.id);
      return m ? '<span class="att att--measure">' + icon('meter') + esc(DM.formatMeasurement(m)) + (m.result ? ' · ' + esc(DM.VERDICTS[m.result].label) : '') + '</span>' : '';
    }
    if (a.type === 'control') {
      const c = DM.findControl(d, a.id);
      return c ? '<span class="att att--control">' + icon('check') + esc(c.description.slice(0, 60)) + ' → ' + esc(c.obtained) + '</span>' : '';
    }
    if (a.type === 'document') {
      const x = d.documents.find(function (y) { return y.id === a.id; });
      return '<span class="att att--doc">' + icon('file') + esc(x ? x.title : a.id) + '</span>';
    }
    return '';
  }

  function messageHtml(d, m, isLast) {
    if (m.role === 'user') {
      return '<div class="msg msg--user' + (m.error ? ' msg--error' : '') + '" id="' + m.id + '">' +
        '<div class="bubble">' + (m.text ? '<p>' + DM.nl2br(m.text) + '</p>' : '') +
        ((m.attachments || []).length ? '<div class="atts">' + m.attachments.map(function (a) { return attachmentHtml(d, a); }).join('') + '</div>' : '') +
        '</div>' +
        (m.error ? '<div class="msg__error">' + icon('alert') + '<span>' + esc(m.error) + '</span>' +
          '<button type="button" class="btn btn--sm btn--primary" data-action="retry">Réessayer</button>' +
          '<button type="button" class="btn btn--sm btn--ghost" data-action="retry-local">Continuer hors ligne</button></div>' : '') +
        '<time class="msg__time">' + esc(DM.fmtDateTime(m.at).slice(-5)) + '</time></div>';
    }
    const ctl = m.controlId ? DM.findControl(d, m.controlId) : null;
    const showCard = ctl && !DM.hasResult(ctl) && isLast;
    const choices = isLast && m.ask && m.ask.choices && m.ask.choices.length ? m.ask.choices : [];
    return '<div class="msg msg--agent" id="' + m.id + '">' +
      '<span class="msg__avatar" aria-hidden="true">' + icon('bolt') + '</span>' +
      '<div class="msg__body"><div class="bubble">' + ui.md(m.text) + '</div>' +
      traceHtml(m.trace) +
      (showCard ? controlCard(d, ctl) : '') +
      (choices.length ? '<div class="quick">' + choices.map(function (c) {
        return '<button type="button" class="chip-btn" data-action="quick" data-text="' + esc(c) + '">' + esc(c) + '</button>';
      }).join('') + '</div>' : '') +
      '<time class="msg__time">' + (m.engine === 'local' ? 'moteur local · ' : m.engine ? 'IA · ' : '') + esc(DM.fmtDateTime(m.at).slice(-5)) + '</time>' +
      '</div></div>';
  }

  function logHtml(d) {
    const msgs = d.messages;
    let lastAssistant = -1;
    msgs.forEach(function (m, i) { if (m.role === 'assistant') lastAssistant = i; });
    return msgs.map(function (m, i) { return messageHtml(d, m, i === lastAssistant && i === msgs.length - 1); }).join('') +
      (state.busy ? '<div class="msg msg--agent msg--typing" id="typing"><span class="msg__avatar">' + icon('bolt') + '</span>' +
        '<div class="bubble"><span class="dots"><i></i><i></i><i></i></span> <span id="typing-label">' + esc(typingLabel()) + '</span></div></div>' : '');
  }
  function typingLabel() {
    const s = Math.round((Date.now() - state.since) / 1000);
    return (state.engine === 'remote' ? 'L’agent analyse' : 'Analyse locale') + (s >= 3 ? ' · ' + s + ' s' : '') + '…';
  }

  /* ---------- panneau « État du diagnostic » ---------- */
  ui.diagPanel = function (d) {
    const V = DM.VERDICT_STATUS[d.verdict.status];
    const T = DM.installType(d.installationType);
    const done = d.controls.filter(DM.hasResult);
    const next = DM.nextControl(d);
    const planned = DM.pendingControls(d).filter(function (c) { return !next || c.id !== next.id; });
    const eq = [d.brand, d.model, d.reference].filter(Boolean).join(' · ');
    function hypLine(h) {
      const S = DM.HYP_STATUS[h.status];
      return '<li class="ph ph--' + S.cls + '"><details><summary><span class="ph__sym" aria-hidden="true">' + S.symbol + '</span><span class="ph__cause">' + esc(h.cause) +
        '</span><span class="chip chip--' + S.cls + '">' + S.label + '</span></summary>' +
        (h.reason ? '<p class="small muted">' + esc(h.reason) + '</p>' : '') +
        (h.evidence.length ? '<p class="small"><b>Preuves</b></p><ul class="ev ev--pro">' + h.evidence.map(function (e) { return '<li>' + esc(e.text) + '</li>'; }).join('') + '</ul>' : '') +
        (h.counterEvidence.length ? '<p class="small"><b>Contre-preuves</b></p><ul class="ev ev--con">' + h.counterEvidence.map(function (e) { return '<li>' + esc(e.text) + '</li>'; }).join('') + '</ul>' : '') +
        (h.conclusion ? '<p class="small"><b>Conclusion :</b> ' + esc(h.conclusion) + '</p>' : '') +
        '</details></li>';
    }
    return '<div class="panel__inner">' +
      '<h2 class="panel__title">' + icon('target') + 'État du diagnostic</h2>' +
      '<div class="verdict verdict--' + V.cls + '">' + icon(d.verdict.status === 'confirme' ? 'check' : d.verdict.status === 'probable' ? 'branch' : 'info') +
        '<div><strong>' + V.label + '</strong>' + (d.verdict.summary ? '<p>' + esc(d.verdict.summary) + '</p>' : '') +
        (d.verdict.missing.length ? '<p class="small"><b>Il me manque :</b> ' + d.verdict.missing.map(esc).join(' ; ') + '</p>' : '') + '</div></div>' +
      '<dl class="pv">' +
        '<dt>Matériel</dt><dd>' + (d.installationType !== 'autre' ? esc(T.label) + (eq ? ' — ' : '') : '') + (eq ? esc(eq) : (d.installationType === 'autre' ? '<span class="muted">à identifier</span>' : '')) + '</dd>' +
        (d.site || d.client ? '<dt>Site</dt><dd>' + esc([d.client, d.site, d.location].filter(Boolean).join(' — ')) + '</dd>' : '') +
        '<dt>Panne</dt><dd>' + (d.description ? esc(d.description) : '<span class="muted">à décrire</span>') + '</dd>' +
      '</dl>' +
      '<h3 class="panel__sub">Hypothèses</h3>' +
      (d.hypotheses.length ? '<ul class="plist">' + d.hypotheses.map(hypLine).join('') + '</ul>' : '<p class="small muted">Pas encore d’hypothèse.</p>') +
      '<h3 class="panel__sub">Contrôles</h3><ul class="clist">' +
        done.map(function (c) { return '<li class="cl cl--done"><span aria-hidden="true">✓</span><span>' + esc(c.description) + '<br><small class="muted">' + esc(c.obtained) + ' · ' + esc(DM.VERDICTS[c.verdict].label) + '</small></span></li>'; }).join('') +
        (next ? '<li class="cl cl--next"><span aria-hidden="true">▶</span><span><b>' + esc(next.description) + '</b><br><small class="muted">prochain contrôle · risque N' + DM.riskLevel(next, d.installationType).level + '</small></span></li>' : '') +
        planned.map(function (c) { return '<li class="cl"><span aria-hidden="true">○</span><span>' + esc(c.description) + '</span></li>'; }).join('') +
        (!d.controls.length ? '<li class="small muted">Aucun contrôle pour l’instant.</li>' : '') + '</ul>' +
      (d.measurements.length ? '<h3 class="panel__sub">Mesures</h3><table class="mtable"><tbody>' + d.measurements.slice().reverse().map(function (m) {
        return '<tr><td><b>' + esc(m.label) + '</b><br><small class="muted">' + esc(DM.fmtDateTime(m.at)) + (m.location ? ' · ' + esc(m.location) : '') + '</small></td>' +
          '<td class="measure">' + esc(m.value) + ' ' + esc(m.unit) + (m.result ? '<br>' + ui.chip(DM.VERDICTS[m.result].label, DM.VERDICTS[m.result].cls) : '') + '</td></tr>';
      }).join('') + '</tbody></table>' : '') +
      (d.facts.length ? '<h3 class="panel__sub">Ce que je sais déjà</h3><ul class="facts">' + d.facts.map(function (f) {
        return '<li><span class="muted">' + esc(f.question) + '</span><b>' + esc(f.answer) + '</b></li>';
      }).join('') + '</ul>' : '') +
      (d.photos.length ? '<h3 class="panel__sub">Photos</h3>' + ui.photoGallery(d.photos, { readonly: true }) : '') +
      (d.documents.length ? '<h3 class="panel__sub">Documents consultés</h3><ul class="facts">' + d.documents.map(function (x) { return '<li>' + icon('file') + esc(x.title) + '</li>'; }).join('') + '</ul>' : '') +
      '<div class="btncol panel__actions">' +
        '<a class="btn btn--primary btn--lg btn--block" href="#/diag/' + encodeURIComponent(d.id) + '/rapport">' + icon('file') + 'GÉNÉRER LE RAPPORT</a>' +
        '<button type="button" class="btn btn--success btn--block" data-action="closure">' + icon('lock') + (d.status === 'cloture' ? 'Réparation et clôture' : 'Réparation et clôture…') + '</button>' +
        '<div class="btnrow">' +
          '<a class="btn btn--ghost btn--sm" href="#/diag/' + encodeURIComponent(d.id) + '/arbre">' + icon('branch') + 'Vue arbre</a>' +
          '<a class="btn btn--ghost btn--sm" href="#/diag/' + encodeURIComponent(d.id) + '/modifier">' + icon('edit') + 'Informations</a>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-action="duplicate">' + icon('copy') + 'Dupliquer</button>' +
          '<button type="button" class="btn btn--danger-ghost btn--sm" data-action="delete">' + icon('trash') + 'Supprimer</button>' +
        '</div></div>' +
      '</div>';
  };

  /* ---------- envoi et tour d'agent ---------- */
  function refreshLog(scroll) {
    const log = document.getElementById('chat-log');
    const p = DM.app.current && DM.app.current.params;
    if (!log || !p) return;
    const d = load(p.id);
    log.innerHTML = logHtml(d);
    ui.hydratePhotos(log);
    const panel = document.getElementById('diag-panel');
    if (panel) { panel.innerHTML = ui.diagPanel(d); ui.hydratePhotos(panel); }
    const strip = document.getElementById('agent-strip');
    if (strip) strip.innerHTML = stripHtml(d);
    const title = document.querySelector('.topbar__title');
    if (title && title.textContent !== d.name) { title.textContent = d.name; document.title = d.name + ' · DIAG-MAINT'; }
    setComposerBusy(state.busy);
    if (scroll !== false) scrollToEnd();
  }
  function scrollToEnd() {
    requestAnimationFrame(function () { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); });
  }
  function setComposerBusy(b) {
    const c = document.getElementById('composer');
    if (!c) return;
    c.classList.toggle('is-busy', b);
    c.querySelectorAll('button, textarea, input').forEach(function (el) { el.disabled = b; });
  }

  async function processTurn(id, opts) {
    if (state.busy) return;
    state.busy = true; state.since = Date.now();
    state.engine = DM.agentClient.willUseServer() && DM.store.settings().agentMode !== 'local' && !(opts && opts.forceLocal) ? 'remote' : 'local';
    refreshLog();
    state.timer = setInterval(function () { const el = document.getElementById('typing-label'); if (el) el.textContent = typingLabel(); }, 1000);
    try {
      const d = load(id);
      const out = await DM.agentClient.turn(d, opts);
      DM.store.save(out.result.diag);
      if (out.fallback) ui.toast(out.fallback);
      if (out.remote) DM.sync.flush();
    } catch (e) {
      const d = DM.store.get(id);
      if (d) {
        const last = d.messages[d.messages.length - 1];
        if (last && last.role === 'user') { last.error = e.message || 'Erreur'; last.pending = false; }
        DM.store.save(d);
      }
    } finally {
      clearInterval(state.timer);
      state.busy = false;
      if (DM.app.current && DM.app.current.name === 'agent' && DM.app.current.params.id === id) refreshLog();
    }
  }

  function sendMessage(id, text, attachments) {
    const d = load(id);
    DM.addMessage(d, { role: 'user', text: text || '', attachments: attachments || [], pending: true });
    save(d);
    return processTurn(id);
  }

  /* ---------- modales ---------- */
  function riskGate(d, c) {
    const r = DM.riskLevel(c, d.installationType);
    if (r.level < 2 || c.safetyAck) return Promise.resolve(true);
    return ui.modal({
      title: 'RISQUE — avant ce contrôle', icon: 'alert', tone: r.level >= 3 ? 'danger' : 'warning',
      body: '<div class="recap">' + ui.typeBadge(c.type) + '<p><strong>' + esc(c.description) + '</strong></p></div>' + riskBanner(d, c, false) +
        r.safety.confirmations.map(function (t, i) { return '<label class="check"><input type="checkbox" name="ack' + i + '" required><span>' + esc(t) + '</span></label>'; }).join(''),
      actions: [{ label: 'Annuler', value: null, cls: 'btn--ghost' }, { label: icon('shield') + 'Consignes appliquées', value: 'ok', cls: r.level >= 3 ? 'btn--danger' : 'btn--warning', submit: true }]
    }).then(function (res) {
      if (!res) return false;
      const x = load(d.id); DM.acknowledgeSafety(x, c.id); save(x);
      return true;
    });
  }

  function currentControl(d) {
    const lastAgent = d.messages.slice().reverse().find(function (m) { return m.role === 'assistant'; });
    const c = lastAgent && lastAgent.controlId ? DM.findControl(d, lastAgent.controlId) : null;
    return c && !DM.hasResult(c) ? c : DM.nextControl(d);
  }

  function measureModal(id, controlId) {
    const d = load(id);
    const pending = DM.pendingControls(d);
    const cur = controlId ? DM.findControl(d, controlId) : currentControl(d);
    const guessKind = cur ? (DM.controlMeasureKinds(cur)[0] || 'tension') : 'tension';
    function unitOptions(kind) { return DM.MEASURE_KINDS[kind].units.filter(Boolean).map(function (u) { return '<option value="' + esc(u) + '">'; }).join(''); }
    const start = cur ? Promise.resolve(true) : Promise.resolve(true);
    return start.then(function () {
      return ui.modal({
        title: 'Saisir une mesure', icon: 'meter',
        body:
          '<div class="field"><label for="ms-ctl">Contrôle concerné</label><select id="ms-ctl" name="controlId" class="select"><option value="">Aucun (mesure libre)</option>' +
            pending.concat(d.controls.filter(DM.hasResult)).map(function (c) { return '<option value="' + c.id + '"' + (cur && cur.id === c.id ? ' selected' : '') + '>' + esc(c.description.slice(0, 80)) + '</option>'; }).join('') + '</select></div>' +
          '<div class="field"><label for="ms-kind">Type de mesure</label><select id="ms-kind" name="kind" class="select">' +
            Object.keys(DM.MEASURE_KINDS).map(function (k) { return '<option value="' + k + '"' + (k === guessKind ? ' selected' : '') + '>' + esc(DM.MEASURE_KINDS[k].label) + '</option>'; }).join('') + '</select></div>' +
          '<div class="field"><label for="ms-label">Libellé</label><input id="ms-label" name="label" placeholder="Ex. Tension L-N, Intensité compresseur"></div>' +
          '<div class="grid2 grid2--measure"><div class="field"><label for="ms-value">Valeur <span class="req">*</span></label><input id="ms-value" name="value" required inputmode="decimal" placeholder="Ex. 230"></div>' +
          '<div class="field"><label for="ms-unit">Unité</label><input id="ms-unit" name="unit" list="ms-units" value="' + esc(DM.MEASURE_KINDS[guessKind].units[0]) + '"><datalist id="ms-units">' + unitOptions(guessKind) + '</datalist></div></div>' +
          '<div class="field"><label for="ms-loc">Emplacement</label><input id="ms-loc" name="location" value="' + esc(cur ? cur.location : '') + '" placeholder="Ex. Unité extérieure, bornier X1"></div>' +
          '<fieldset class="field"><legend>Résultat</legend><div class="seg seg--verdict">' +
            Object.keys(DM.VERDICTS).map(function (k) { const V = DM.VERDICTS[k]; return '<label class="seg__opt seg__opt--' + V.cls + '"><input type="radio" name="result" value="' + k + '"><span>' + V.label + '</span></label>'; }).join('') +
          '</div><p class="hint">Facultatif : l’agent peut l’apprécier lui-même.</p></fieldset>' +
          '<div class="field"><label for="ms-com">Commentaire</label><textarea id="ms-com" name="comment" rows="2"></textarea></div>',
        actions: [{ label: 'Annuler', value: null, cls: 'btn--ghost' }, { label: icon('check') + 'Enregistrer et envoyer', value: 'ok', cls: 'btn--primary', submit: true }],
        onOpen: function (modal, form) {
          const kind = form.querySelector('#ms-kind'), unit = form.querySelector('#ms-unit'), dl = form.querySelector('#ms-units'), val = form.querySelector('#ms-value');
          kind.addEventListener('change', function () {
            const K = DM.MEASURE_KINDS[kind.value];
            dl.innerHTML = unitOptions(kind.value);
            unit.value = K.units[0] || '';
            val.setAttribute('inputmode', K.choices || kind.value === 'code' || kind.value === 'commentaire' ? 'text' : 'decimal');
            val.placeholder = K.choices ? K.choices.join(' / ') : (kind.value === 'code' ? 'Ex. E6' : 'Ex. 230');
          });
        }
      });
    }).then(function (res) {
      if (!res) return;
      const x = load(id);
      const c = res.data.controlId ? DM.findControl(x, res.data.controlId) : null;
      return (c ? riskGate(x, c) : Promise.resolve(true)).then(function (ok) {
        if (!ok) return;
        const y = load(id);
        const m = DM.addMeasurement(y, {
          kind: res.data.kind, label: res.data.label || (c ? c.description.slice(0, 60) : ''), value: res.data.value, unit: res.data.unit,
          location: res.data.location, controlId: res.data.controlId || null, result: res.data.result || null, comment: res.data.comment
        });
        save(y);
        return sendMessage(id, 'Mesure : ' + DM.formatMeasurement(m) + (m.result ? ' — ' + DM.VERDICTS[m.result].label : '') + (m.comment ? '\n' + m.comment : ''),
          [{ type: 'measurement', id: m.id }]);
      });
    });
  }

  function controlDoneModal(id, controlId) {
    const d = load(id);
    const pending = DM.pendingControls(d);
    if (!pending.length) { ui.toast('Aucun contrôle en attente. Décris ce que tu as vérifié dans le message.'); return; }
    const cur = (controlId && DM.findControl(d, controlId)) || currentControl(d) || pending[0];
    return riskGate(d, cur).then(function (ok) {
      if (!ok) return;
      return ui.modal({
        title: 'Contrôle effectué', icon: 'check',
        body:
          '<div class="field"><label for="cd-ctl">Contrôle</label><select id="cd-ctl" name="controlId" class="select">' +
            pending.map(function (c) { return '<option value="' + c.id + '"' + (c.id === cur.id ? ' selected' : '') + '>' + esc(c.description.slice(0, 90)) + '</option>'; }).join('') + '</select></div>' +
          (cur.expected ? '<p class="small"><span class="muted">Attendu :</span> ' + esc(cur.expected) + '</p>' : '') +
          '<div class="field"><label for="cd-obt">Résultat obtenu <span class="req">*</span></label><textarea id="cd-obt" name="obtained" rows="3" required placeholder="Ce qui a été constaté ou mesuré"></textarea></div>' +
          '<fieldset class="field"><legend>Verdict <span class="req">*</span></legend><div class="seg seg--verdict">' +
            Object.keys(DM.VERDICTS).map(function (k) { const V = DM.VERDICTS[k]; return '<label class="seg__opt seg__opt--' + V.cls + '"><input type="radio" name="verdict" value="' + k + '" required><span>' + V.label + '</span></label>'; }).join('') +
          '</div></fieldset>' +
          '<div class="field"><label for="cd-conc">Commentaire</label><textarea id="cd-conc" name="conclusion" rows="2"></textarea></div>',
        actions: [{ label: 'Annuler', value: null, cls: 'btn--ghost' }, { label: icon('check') + 'Enregistrer et envoyer', value: 'ok', cls: 'btn--primary', submit: true }]
      });
    }).then(function (res) {
      if (!res) return;
      const x = load(id);
      const c = DM.findControl(x, res.data.controlId);
      return riskGate(x, c).then(function (ok) {
        if (!ok) return;
        const y = load(id);
        DM.recordResult(y, c.id, { obtained: res.data.obtained, verdict: res.data.verdict, conclusion: res.data.conclusion });
        save(y);
        return sendMessage(id, 'Contrôle effectué : ' + c.description + ' → ' + res.data.obtained + ' (' + DM.VERDICTS[res.data.verdict].label + ')' +
          (res.data.conclusion ? '\n' + res.data.conclusion : ''), [{ type: 'control', id: c.id }]);
      });
    });
  }

  function photoModal(id, ids) {
    return ui.modal({
      title: DM.plural(ids.length, 'photo'), icon: 'camera',
      body: '<fieldset class="field"><legend>Que montre la photo ?</legend><div class="kind-grid">' +
          Object.keys(DM.PHOTO_KINDS).map(function (k, i) {
            return '<label class="kind-chip"><input type="radio" name="kind" value="' + k + '"' + (i === 0 ? ' checked' : '') + '><span>' + esc(DM.PHOTO_KINDS[k]) + '</span></label>';
          }).join('') + '</div></fieldset>' +
        '<div class="field"><label for="ph-c">Commentaire (facultatif)</label><input id="ph-c" name="caption" placeholder="Ex. plaque de l’unité extérieure"></div>',
      noAutofocus: true,
      actions: [{ label: 'Annuler', value: null, cls: 'btn--ghost' }, { label: icon('check') + 'Envoyer', value: 'ok', cls: 'btn--primary', submit: true }]
    }).then(function (res) {
      if (!res) { DM.photos.removeMany(ids); return; }
      const d = load(id);
      ids.forEach(function (pid) { d.photos.push({ id: pid, kind: res.data.kind || 'autre', caption: String(res.data.caption || '').trim(), addedAt: new Date().toISOString() }); });
      save(d);
      const label = DM.PHOTO_KINDS[res.data.kind] || 'Photo';
      return sendMessage(id, res.data.caption ? String(res.data.caption).trim() : 'Photo : ' + label.toLowerCase(),
        ids.map(function (pid) { return { type: 'photo', id: pid }; }));
    });
  }

  async function documentModal(id) {
    const h = await DM.agentClient.health();
    if (!h.data || h.error) { ui.toast('La base documentaire nécessite le serveur (Réglages → Serveur IA).', 'error'); return; }
    const d = load(id);
    const res = await ui.modal({
      title: 'Ajouter un document', icon: 'file',
      body:
        '<div class="field"><label class="btn btn--ghost btn--block">' + icon('upload') + '<span id="doc-name">Choisir un PDF ou une image</span>' +
          '<input type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/webp,text/plain" hidden></label></div>' +
        '<div class="field"><label for="dc-type">Type</label><select id="dc-type" name="docType" class="select">' +
          [['notice', 'Notice'], ['schema', 'Schéma'], ['manuel', 'Manuel'], ['fiche_technique', 'Fiche technique'], ['codes_defaut', 'Liste des codes défaut'], ['autre', 'Autre']]
            .map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('') + '</select></div>' +
        '<div class="grid2"><div class="field"><label for="dc-man">Fabricant</label><input id="dc-man" name="manufacturer" value="' + esc(d.brand) + '"></div>' +
        '<div class="field"><label for="dc-cat">Catégorie</label><input id="dc-cat" name="category" value="' + esc(d.installationType !== 'autre' ? DM.installType(d.installationType).label : '') + '"></div></div>' +
        '<div class="grid2"><div class="field"><label for="dc-ser">Série</label><input id="dc-ser" name="series"></div>' +
        '<div class="field"><label for="dc-mod">Modèle</label><input id="dc-mod" name="model" value="' + esc(d.model) + '"></div></div>' +
        '<div class="field"><label for="dc-ref">Référence</label><input id="dc-ref" name="reference" value="' + esc(d.reference) + '"></div>' +
        '<div class="field"><label for="dc-title">Titre</label><input id="dc-title" name="title" placeholder="Ex. Notice d’installation"></div>',
      noAutofocus: true,
      onOpen: function (modal, form) {
        const input = form.querySelector('input[type=file]');
        input.addEventListener('change', function () {
          const f = input.files && input.files[0];
          modal.querySelector('#doc-name').textContent = f ? f.name + ' (' + Math.round(f.size / 1024) + ' Ko)' : 'Choisir un PDF ou une image';
          if (f && !form.title.value) form.title.value = f.name.replace(/\.[a-z0-9]+$/i, '');
        });
        modal._file = function () { return input.files && input.files[0]; };
        form._getFile = modal._file;
      },
      validate: function (data, form) { return form._getFile() ? null : 'Choisis un fichier.'; },
      actions: [{ label: 'Annuler', value: null, cls: 'btn--ghost' }, { label: icon('upload') + 'Envoyer', value: 'ok', cls: 'btn--primary', submit: true }]
    });
    if (!res) return;
    const file = res.data.file;
    if (!file || !file.size) return;
    ui.toast('Envoi du document…');
    const dataUrl = await new Promise(function (resolve, reject) { const fr = new FileReader(); fr.onload = function () { resolve(fr.result); }; fr.onerror = reject; fr.readAsDataURL(file); });
    const meta = { title: res.data.title, docType: res.data.docType, manufacturer: res.data.manufacturer, category: res.data.category, series: res.data.series, model: res.data.model, reference: res.data.reference };
    const out = await DM.agentClient.uploadDocument(meta, file.type || 'application/pdf', String(dataUrl).split(',')[1]);
    const x = load(id);
    x.documents.push({ id: out.document.id, title: out.document.title, at: new Date().toISOString() });
    save(x);
    ui.toast('Document ajouté à la base documentaire', 'success');
    return sendMessage(id, 'Document ajouté : ' + out.document.title + ' (' + out.document.id + ')', [{ type: 'document', id: out.document.id }]);
  }

  function closureModal(id) {
    const d = load(id);
    const confirmed = DM.confirmedHypotheses(d);
    const partsText = d.parts.map(function (p) { return [p.designation, p.reference, p.quantity].join(' ; '); }).join('\n');
    return ui.modal({
      title: 'Réparation et clôture', icon: 'lock',
      body:
        '<div class="verdict verdict--' + DM.VERDICT_STATUS[d.verdict.status].cls + '"><div><strong>' + DM.VERDICT_STATUS[d.verdict.status].label + '</strong>' +
          (confirmed.length ? '<p>Cause confirmée : ' + confirmed.map(function (h) { return esc(h.cause); }).join(' ; ') + '</p>' :
            '<p class="small">La clôture exige une cause confirmée par un contrôle. Tu peux enregistrer la réparation dès maintenant.</p>') + '</div></div>' +
        '<div class="field"><label for="cl-diag">Diagnostic</label><textarea id="cl-diag" name="finalDiagnosis" rows="2">' + esc(d.finalDiagnosis || (confirmed.length ? confirmed.map(function (h) { return h.cause; }).join(' ; ') : d.verdict.summary)) + '</textarea></div>' +
        '<div class="field"><label for="cl-rep">Réparation effectuée</label><textarea id="cl-rep" name="repair" rows="3">' + esc(d.repair) + '</textarea></div>' +
        '<div class="field"><label for="cl-parts">Pièces utilisées</label><textarea id="cl-parts" name="partsText" rows="3" placeholder="Une pièce par ligne : désignation ; référence ; quantité">' + esc(partsText) + '</textarea></div>' +
        '<div class="field"><label for="cl-reco">Recommandations</label><textarea id="cl-reco" name="recommendations" rows="2">' + esc(d.recommendations) + '</textarea></div>' +
        '<div class="field"><label for="cl-res">Résultat final</label><select id="cl-res" name="finalResult" class="select"><option value="">—</option>' +
          Object.keys(DM.FINAL_RESULTS).map(function (k) { return '<option value="' + k + '"' + (d.finalResult === k ? ' selected' : '') + '>' + esc(DM.FINAL_RESULTS[k]) + '</option>'; }).join('') + '</select></div>' +
        '<div class="grid2"><div class="field"><label for="cl-cli">Client</label><input id="cl-cli" name="client" value="' + esc(d.client) + '"></div>' +
        '<div class="field"><label for="cl-site">Site</label><input id="cl-site" name="site" value="' + esc(d.site) + '"></div></div>',
      actions: [{ label: 'Annuler', value: null, cls: 'btn--ghost' }, { label: 'Enregistrer', value: 'save', cls: 'btn--ghost', submit: true },
        { label: icon('lock') + 'Clôturer', value: 'close', cls: 'btn--success', submit: true }],
      validate: function (data, form, value) {
        if (value !== 'close') return null;
        const x = DM.clone(d);
        try { DM.closeDiagnostic(x, parseClosure(data)); return null; } catch (e) { return e.message; }
      }
    }).then(function (res) {
      if (!res) return;
      const x = load(id);
      const f = parseClosure(res.data);
      DM.patchInfo(x, { client: res.data.client, site: res.data.site });
      if (res.value === 'close') {
        DM.closeDiagnostic(x, f);
        save(x);
        DM.sync.enqueue(id); DM.sync.flush();
        ui.toast('Diagnostic clôturé — il enrichit la base de connaissances', 'success');
      } else {
        DM.saveConclusion(x, f); save(x);
        ui.toast('Enregistré', 'success');
      }
      refreshLog(false);
    });
  }
  function parseClosure(data) {
    const parts = String(data.partsText || '').split('\n').map(function (l) {
      const p = l.split(/[;|]/).map(function (s) { return s.trim(); });
      return { designation: p[0] || '', reference: p[1] || '', quantity: p[2] || '1' };
    });
    return { finalDiagnosis: data.finalDiagnosis, repair: data.repair, recommendations: data.recommendations, finalResult: data.finalResult, parts: parts };
  }

  function stripHtml(d) {
    const V = DM.VERDICT_STATUS[d.verdict.status];
    const next = d.status === 'cloture' ? null : DM.nextControl(d);
    const online = DM.agentClient.aiOnline();
    const eq = [d.brand, d.model || d.reference].filter(Boolean).join(' ') || (d.installationType !== 'autre' ? DM.installType(d.installationType).label : 'Matériel à identifier');
    return ui.chip(V.label.replace('Diagnostic ', ''), V.cls, d.verdict.status === 'confirme' ? 'check' : null) +
      '<span class="strip__eq">' + esc(eq) + '</span>' +
      (next ? '<span class="strip__next">▶ ' + esc(next.description.slice(0, 40)) + '</span>' : '') +
      '<span class="engine-dot' + (online ? ' is-on' : '') + '" title="' + (online ? 'IA en ligne' : 'Moteur local') + '">' + (online ? 'IA' : 'Local') + '</span>';
  }

  /* ---------- vue ---------- */
  DM.views.agent = {
    render: function (params) {
      const d = DM.store.get(params.id);
      if (!d) return ui.notFound();
      if (!d.messages.length) {
        DM.addMessage(d, { role: 'assistant', engine: null,
          text: d.description ? 'J’ai repris le diagnostic « ' + d.name + ' ». Où en es-tu ? Décris-moi ce que tu constates, ou envoie une photo.' : GREETING });
        save(d);
      }
      const idq = encodeURIComponent(d.id);
      const speech = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
      return {
        title: d.name,
        back: '#/historique',
        actions: '<a class="btn btn--icon btn--flat" href="#/diag/' + idq + '/rapport" aria-label="Rapport" title="Rapport">' + icon('file') + '</a>' +
          '<button type="button" class="btn btn--icon btn--flat panel-toggle" data-action="panel" aria-label="État du diagnostic" title="État du diagnostic">' + icon('list') + '</button>',
        html:
          '<div class="agent' + (state.panel ? ' panel-open' : '') + '" id="agent">' +
            '<button type="button" class="agent-strip" id="agent-strip" data-action="panel" aria-label="Afficher l’état du diagnostic">' + stripHtml(d) + '</button>' +
            '<div class="agent__cols">' +
              '<section class="chat" id="chat-log" aria-live="polite" aria-label="Conversation">' + logHtml(d) + '</section>' +
              '<aside class="panel" id="diag-panel" aria-label="État du diagnostic">' + ui.diagPanel(d) + '</aside>' +
            '</div>' +
          '</div>' +
          '<form class="composer" id="composer" autocomplete="off">' +
            '<div class="composer__tools">' +
              '<label class="tool">' + icon('camera') + '<span>Photo</span><input type="file" accept="image/*" multiple hidden id="chat-photo"></label>' +
              '<button type="button" class="tool" data-action="doc">' + icon('file') + '<span>Document</span></button>' +
              '<button type="button" class="tool" data-action="measure">' + icon('meter') + '<span>Mesure</span></button>' +
              '<button type="button" class="tool" data-action="control-done">' + icon('check') + '<span>Contrôle</span></button>' +
            '</div>' +
            '<div class="composer__row">' +
              '<textarea id="chat-input" rows="1" placeholder="Écrire un message…" aria-label="Message" data-no-dictate></textarea>' +
              (speech ? '<button type="button" class="btn btn--icon btn--ghost" data-action="dictate" id="mic-btn" aria-label="Dicter">' + icon('mic') + '</button>' : '') +
              '<button type="submit" class="btn btn--icon btn--primary" aria-label="Envoyer">' + icon('send') + '</button>' +
            '</div>' +
          '</form>'
      };
    },

    mount: function (root, params) {
      document.body.classList.add('mode-terrain');
      ui.hydratePhotos(root);
      const form = document.getElementById('composer');
      const input = document.getElementById('chat-input');
      function grow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; }
      input.addEventListener('input', grow);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) { e.preventDefault(); form.requestSubmit(); }
      });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const t = input.value.trim();
        if (!t || state.busy) return;
        input.value = ''; grow();
        sendMessage(params.id, t);
      });
      document.getElementById('chat-photo').addEventListener('change', function (e) {
        const files = Array.prototype.slice.call(e.target.files || []);
        e.target.value = '';
        if (!files.length) return;
        ui.toast('Traitement de ' + DM.plural(files.length, 'photo') + '…');
        Promise.all(files.map(function (f) { return DM.photos.add(params.id, f); }))
          .then(function (ids) { return photoModal(params.id, ids); })
          .catch(function (err) { ui.toast(err.message || 'Photo impossible à ajouter.', 'error'); });
      });
      setComposerBusy(state.busy);
      DM.agentClient.health().then(function () {
        const strip = document.getElementById('agent-strip');
        if (strip && DM.store.get(params.id)) strip.innerHTML = stripHtml(DM.store.get(params.id));
      });
      // un message resté « en cours » (application fermée pendant un tour) est relancé
      const d = DM.store.get(params.id);
      const last = d && d.messages[d.messages.length - 1];
      if (last && last.role === 'user' && last.pending && !last.error && !state.busy) processTurn(params.id);
      scrollToEnd();
    },

    unmount: function () {
      document.body.classList.remove('mode-terrain');
      if (dictation) { try { dictation.stop(); } catch (e) { /* rien */ } dictation = null; }
    },

    actions: {
      'quick': function (el, e, p) { if (!state.busy) return sendMessage(p.id, el.dataset.text); },
      'retry': function (el, e, p) {
        const d = load(p.id); const last = d.messages[d.messages.length - 1];
        if (last && last.role === 'user') { last.error = null; last.pending = true; save(d); }
        return processTurn(p.id);
      },
      'retry-local': function (el, e, p) {
        const d = load(p.id); const last = d.messages[d.messages.length - 1];
        if (last && last.role === 'user') { last.error = null; last.pending = true; save(d); }
        return processTurn(p.id, { forceLocal: true });
      },
      'panel': function () {
        state.panel = !state.panel;
        const a = document.getElementById('agent');
        if (a) a.classList.toggle('panel-open', state.panel);
        if (state.panel && window.innerWidth < 900) document.getElementById('diag-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
      'ack': function (el, e, p) {
        const d = load(p.id); const c = DM.findControl(d, el.dataset.id);
        return riskGate(d, c).then(function (ok) { if (ok) refreshLog(false); });
      },
      'measure': function (el, e, p) { return measureModal(p.id, el.dataset.control); },
      'control-done': function (el, e, p) { return controlDoneModal(p.id, el.dataset.id); },
      'doc': function (el, e, p) { return documentModal(p.id); },
      'closure': function (el, e, p) { return closureModal(p.id); },
      'photo-view': function (el, e, p) {
        const d = load(p.id);
        const ph = d.photos.find(function (x) { return x.id === el.dataset.photo; });
        if (!ph) return;
        return DM.photos.url(ph.id).then(function (u) {
          return ui.modal({ title: DM.PHOTO_KINDS[ph.kind] || 'Photo', icon: 'image', noAutofocus: true,
            body: '<div class="photo-full">' + (u ? '<img src="' + esc(u) + '" alt="">' : '') + '</div>' +
              (ph.caption ? '<p>' + esc(ph.caption) + '</p>' : '') +
              (ph.analysis ? '<div class="recap"><span class="small muted">Analyse de l’agent</span><p>' + DM.nl2br(ph.analysis.text) + '</p></div>' : ''),
            actions: [{ label: 'Fermer', value: null, cls: 'btn--ghost' }] });
        });
      },
      'dictate': function (el) { toggleDictation(document.getElementById('chat-input'), el); },
      'duplicate': function (el, e, p) {
        return DM.ops.duplicate(p.id).then(function (copy) { ui.toast('Copie créée', 'success'); DM.app.go('/diag/' + encodeURIComponent(copy.id)); });
      },
      'delete': function (el, e, p) {
        return DM.ops.confirmDelete(p.id).then(function (ok) { if (ok) DM.app.go('/historique'); });
      }
    }
  };

  /* ---------- dictée vocale ---------- */
  let dictation = null;
  function toggleDictation(input, btn) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (dictation) { dictation.stop(); return; }
    const rec = new SR();
    rec.lang = 'fr-FR'; rec.interimResults = false; rec.continuous = true;
    rec.onresult = function (ev) {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (!ev.results[i].isFinal) continue;
        const t = ev.results[i][0].transcript.trim();
        input.value = input.value ? input.value.replace(/\s*$/, ' ') + t : t.charAt(0).toUpperCase() + t.slice(1);
        input.dispatchEvent(new Event('input'));
      }
    };
    rec.onerror = function (ev) { if (ev.error === 'not-allowed') ui.toast('Micro non autorisé.', 'error'); };
    rec.onend = function () { btn.classList.remove('is-rec'); dictation = null; };
    rec.start();
    btn.classList.add('is-rec');
    dictation = rec;
  }
})(window.DM);
