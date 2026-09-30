/* DIAG-MAINT — écran de diagnostic : informations, arbre hypothèses → contrôles → résultats, diagnostic final */
(function (DM) {
  'use strict';
  const esc = DM.esc, nl2br = DM.nl2br, icon = DM.icon, ui = DM.ui;

  const suggestOpen = {};   // diagId -> bool
  const suggestAll = {};    // diagId -> bool
  const UNITS = ['V', 'V AC', 'V DC', 'mV', 'A', 'mA', 'Ω', 'kΩ', 'MΩ', 'µF', 'Hz', 'W', 'kW', 'bar', 'kPa', '°C', 'K', '%', 'm³/h', 'l/min', 'tr/min', 'mm/s'];

  /* ---------- persistance ---------- */
  function load(id) {
    const d = DM.store.get(id);
    if (!d) throw new Error('Diagnostic introuvable.');
    return d;
  }
  /** Sauvegarde les champs du diagnostic final saisis mais pas encore enregistrés. */
  function captureFinal(d) {
    const f = document.getElementById('final-form');
    if (f) DM.saveConclusion(d, ui.formData(f));
  }
  /** Applique fn au diagnostic, enregistre, puis rafraîchit l'écran (sauf refresh=false). */
  function mutate(id, fn, refresh) {
    const d = load(id);
    captureFinal(d);
    const r = fn(d);
    DM.store.save(d);
    if (refresh !== false) DM.app.refresh();
    return r;
  }
  /** Valide une opération sur une copie (pour afficher l'erreur dans la modale sans rien modifier). */
  function dryRun(d, fn) {
    try { fn(DM.clone(d)); return null; } catch (e) { return e.message; }
  }
  function scrollToEl(id) {
    setTimeout(function () {
      const el = document.getElementById(id);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(function () { el.classList.remove('flash'); }, 1600); }
    }, 60);
  }

  /* ---------- rendu ---------- */
  function stepper(d) {
    const cur = DM.currentStep(d), closed = d.status === 'cloture';
    return '<ol class="stepper" aria-label="Avancement">' + DM.STEPS.map(function (s, i) {
      const st = closed || i < cur ? 'done' : i === cur ? 'current' : 'todo';
      return '<li class="stepper__item is-' + st + '"' + (st === 'current' ? ' aria-current="step"' : '') + '><span class="stepper__dot">' + (st === 'done' ? icon('check') : i + 1) + '</span><span class="stepper__label">' + s + '</span></li>';
    }).join('') + '</ol>';
  }

  function infoSections(d) {
    const T = DM.installType(d.installationType);
    const symptoms = DM.symptomList(d);
    const reminder = DM.domainSafetyReminder(d.installationType);
    const rows = [['Type', T.label], ['Marque', d.brand], ['Modèle', d.model], ['Référence', d.reference], ['Localisation', d.location], ['Date', DM.fmtDate(d.date)]];
    return '<section class="section card" id="s-panne"><h2 class="section__title">' + icon('alert') + 'Panne constatée</h2><p class="prose">' + nl2br(d.description) + '</p></section>' +
      '<section class="section card"><h2 class="section__title">' + icon(T.icon) + 'Informations matériel</h2><dl class="specs">' +
        rows.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + (r[1] ? esc(r[1]) : '<span class="muted">—</span>') + '</dd></div>'; }).join('') + '</dl></section>' +
      '<section class="section card"><h2 class="section__title">' + icon('symptom') + 'Symptômes</h2>' +
        (symptoms.length ? '<ul class="symptoms">' + symptoms.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' : '<p class="muted small">Aucun symptôme renseigné.</p>') + '</section>' +
      '<section class="section card"><h2 class="section__title">' + icon('camera') + 'Photos</h2><div id="diag-photos">' + ui.photoGallery(d.photos) + '</div></section>' +
      (reminder ? '<div class="notice notice--safety">' + icon('shield') + '<div><strong>Rappel sécurité</strong><p class="small">' + esc(reminder) + '</p></div></div>' : '');
  }

  function suggestionsBlock(d) {
    const all = DM.suggestHypotheses(d);
    if (!all.length) return '';
    const relevant = all.filter(function (s) { return s.score > 0; });
    const open = suggestOpen[d.id] !== undefined ? suggestOpen[d.id] : d.hypotheses.length === 0;
    const showAll = suggestAll[d.id] || !relevant.length;
    const list = showAll ? all : relevant;
    return '<div class="suggest' + (open ? ' is-open' : '') + '">' +
      '<button type="button" class="suggest__head" data-action="toggle-suggest" aria-expanded="' + open + '">' + icon('bulb') +
        '<span><strong>Hypothèses suggérées</strong><span class="small muted">' + (relevant.length ? DM.plural(relevant.length, 'piste') + ' d’après les symptômes' : 'pistes courantes pour ce type d’installation') + '</span></span>' + icon('down', 'suggest__chev') + '</button>' +
      (open ? '<div class="suggest__body">' + list.map(function (s) {
        const t = s.template;
        return '<div class="suggest__item">' +
          '<div class="suggest__text"><strong>' + esc(t.cause) + '</strong>' +
          '<span class="small">' + esc(t.reason) + '</span>' +
          (s.matched.length ? '<span class="small match">' + icon('tag') + 'Indices : ' + s.matched.map(esc).join(', ') + '</span>' : '') +
          '<span class="small muted">' + DM.plural(t.controls.length, 'contrôle proposé', 'contrôles proposés') + ' : ' + t.controls.map(function (c) { return DM.CONTROL_TYPES[c.type].short.toLowerCase(); }).join(', ') + '</span></div>' +
          '<button type="button" class="btn btn--sm btn--primary" data-action="add-suggestion" data-tpl="' + esc(t.id) + '" aria-label="Ajouter l’hypothèse ' + esc(t.cause) + '">' + icon('plus') + 'Ajouter</button></div>';
      }).join('') +
      (relevant.length && relevant.length < all.length ? '<button type="button" class="btn btn--flat btn--sm" data-action="suggest-all">' + (showAll ? 'Afficher seulement les pistes pertinentes' : 'Afficher toutes les pistes (' + all.length + ')') + '</button>' : '') +
      '<p class="small muted">Suggestions indicatives : chaque hypothèse doit être vérifiée par un contrôle.</p></div>' : '') +
      '</div>';
  }

  function nextStepHint(d, h, st) {
    if (st === 'confirmee' || st === 'ecartee') return '';
    const ctrls = DM.controlsOf(d, h.id);
    if (!ctrls.length) return '<div class="hint-box">' + icon('info') + '<span>Ajoutez un contrôle pour vérifier cette hypothèse.</span></div>';
    const done = ctrls.filter(DM.hasResult).sort(function (a, b) { return String(b.doneAt).localeCompare(String(a.doneAt)); });
    const pending = ctrls.length - done.length;
    if (!done.length) return '<div class="hint-box">' + icon('meter') + '<span>' + DM.plural(pending, 'contrôle', 'contrôles') + ' à réaliser avant de conclure.</span></div>';
    const last = done[0];
    if (last.verdict === 'non_conforme') {
      return '<div class="hint-box hint-box--ko">' + icon('alert') + '<span>Dernier résultat <b>non conforme</b> : confirmez l’hypothèse, ou approfondissez avec une nouvelle hypothèse issue de ce résultat.</span>' +
        '<button type="button" class="btn btn--sm btn--success" data-action="conclude-hyp" data-id="' + h.id + '" data-preset="confirmee">' + icon('check') + 'Confirmer</button></div>';
    }
    if (last.verdict === 'conforme') {
      return '<div class="hint-box hint-box--ok">' + icon('check') + '<span>Dernier résultat <b>conforme</b> : cette cause semble écartée' + (pending ? ' (encore ' + DM.plural(pending, 'contrôle') + ' prévu)' : '') + '.</span>' +
        '<button type="button" class="btn btn--sm btn--ghost" data-action="conclude-hyp" data-id="' + h.id + '" data-preset="ecartee">' + icon('x') + 'Écarter</button></div>';
    }
    return '<div class="hint-box">' + icon('info') + '<span>Résultat indéterminé : ajoutez un contrôle complémentaire.</span></div>';
  }

  function controlCard(d, c, depth) {
    const T = DM.CONTROL_TYPES[c.type] || DM.CONTROL_TYPES.visuel;
    const s = DM.getSafety(c, d.installationType);
    const done = DM.hasResult(c);
    const V = done ? (DM.VERDICTS[c.verdict] || DM.VERDICTS.indetermine) : null;
    const kids = DM.childHypotheses(d, c.id);
    return '<div class="ctl ctl--' + T.cls + (done ? ' is-done' : '') + '" id="' + c.id + '">' +
      '<div class="ctl__head">' + ui.typeBadge(c.type) + (done ? ui.chip(V.label, V.cls) : ui.chip('À réaliser', 'todo')) + '</div>' +
      (s.level ? '<div class="safety-mini safety--' + s.level + '">' + icon(s.level === 'danger' ? 'bolt' : 'alert') + '<span>' + esc(s.title) +
        (c.safetyAck ? ' — consignes validées' : '') + '</span></div>' : '') +
      '<dl class="kv">' +
        '<dt>Contrôle à effectuer</dt><dd>' + nl2br(c.description) + '</dd>' +
        '<dt>Résultat attendu</dt><dd>' + (c.expected ? nl2br(c.expected) : '<span class="muted">—</span>') + '</dd>' +
        '<dt>Résultat obtenu</dt><dd>' + (done ? nl2br(c.obtained) : '<em class="muted">Non réalisé</em>') + '</dd>' +
        (c.measureValue ? '<dt>Mesure</dt><dd class="measure">' + esc(c.measureValue) + ' ' + esc(c.measureUnit) + '</dd>' : '') +
        (c.conclusion ? '<dt>Conclusion</dt><dd>' + nl2br(c.conclusion) + '</dd>' : '') +
      '</dl>' +
      '<div class="btnrow">' +
        '<button type="button" class="btn btn--sm ' + (done ? 'btn--ghost' : 'btn--primary') + '" data-action="record" data-id="' + c.id + '">' + icon('meter') + (done ? 'Modifier le résultat' : 'Saisir le résultat') + '</button>' +
        (done ? '<button type="button" class="btn btn--sm btn--ghost" data-action="add-hyp" data-control="' + c.id + '">' + icon('branch') + 'Nouvelle hypothèse</button>' : '') +
        '<button type="button" class="btn btn--sm btn--icon btn--ghost" data-action="edit-control" data-id="' + c.id + '" aria-label="Modifier le contrôle">' + icon('edit') + '</button>' +
        '<button type="button" class="btn btn--sm btn--icon btn--danger-ghost" data-action="delete-control" data-id="' + c.id + '" aria-label="Supprimer le contrôle">' + icon('trash') + '</button>' +
      '</div>' +
      (kids.length ? '<div class="subtree"><div class="subtree__label">' + icon('branch') + 'Hypothèses issues de ce résultat</div>' +
        kids.map(function (k) { return hypCard(d, k, depth + 1); }).join('') + '</div>' : '') +
      '</div>';
  }

  function hypCard(d, h, depth) {
    const st = DM.hypothesisState(d, h), S = DM.HYP_STATUS[st];
    const ctrls = DM.controlsOf(d, h.id);
    return '<article class="hyp hyp--' + S.cls + '" id="' + h.id + '" data-depth="' + depth + '">' +
      '<div class="hyp__head">' + ui.chip(S.label, S.cls, st === 'confirmee' ? 'check' : st === 'ecartee' ? 'x' : null) +
        (h.origin === 'assistant' ? '<span class="chip chip--ghost">' + icon('bulb') + 'Suggérée</span>' : '') + '</div>' +
      '<h3 class="hyp__title"><span class="overline">Cause possible</span>' + esc(h.cause) + '</h3>' +
      '<dl class="kv"><dt>Pourquoi cette cause est envisagée</dt><dd>' + (h.reason ? nl2br(h.reason) : '<span class="muted">Non précisé</span>') + '</dd></dl>' +
      '<div class="ctls">' + ctrls.map(function (c) { return controlCard(d, c, depth); }).join('') + '</div>' +
      nextStepHint(d, h, st) +
      (h.conclusion || st === 'confirmee' || st === 'ecartee' ? '<div class="conclusion conclusion--' + S.cls + '"><strong>Conclusion :</strong> ' + (h.conclusion ? nl2br(h.conclusion) : S.label) + '</div>' : '') +
      '<div class="btnrow">' +
        '<button type="button" class="btn btn--sm btn--ghost" data-action="add-control" data-hyp="' + h.id + '">' + icon('plus') + 'Contrôle</button>' +
        '<button type="button" class="btn btn--sm btn--ghost" data-action="conclude-hyp" data-id="' + h.id + '">' + icon('target') + 'Conclure</button>' +
        '<button type="button" class="btn btn--sm btn--icon btn--ghost" data-action="edit-hyp" data-id="' + h.id + '" aria-label="Modifier l’hypothèse">' + icon('edit') + '</button>' +
        '<button type="button" class="btn btn--sm btn--icon btn--danger-ghost" data-action="delete-hyp" data-id="' + h.id + '" aria-label="Supprimer l’hypothèse">' + icon('trash') + '</button>' +
      '</div></article>';
  }

  function treeSection(d) {
    const roots = DM.rootHypotheses(d);
    const general = DM.controlsOf(d, null);
    return '<section class="section" id="s-hyp">' +
      '<div class="section__bar"><h2 class="section__title">' + icon('branch') + 'Hypothèses <span class="count">' + d.hypotheses.length + '</span></h2>' +
      '<button type="button" class="btn btn--sm btn--primary" data-action="add-hyp">' + icon('plus') + 'Hypothèse</button></div>' +
      suggestionsBlock(d) +
      (roots.length ? '<div class="tree">' + roots.map(function (h) { return hypCard(d, h, 0); }).join('') + '</div>'
        : '<div class="empty empty--sm">' + icon('branch') + '<p>Aucune hypothèse pour l’instant. Ajoutez une suggestion ou créez votre propre hypothèse.</p></div>') +
      (general.length ? '<h3 class="section-title">' + icon('meter') + 'Contrôles généraux</h3><div class="tree">' +
        general.map(function (c) { return controlCard(d, c, 0); }).join('') + '</div>' : '') +
      '</section>';
  }

  function finalSection(d) {
    const confirmed = DM.confirmedHypotheses(d);
    const closed = d.status === 'cloture';
    const suggestion = confirmed.map(function (h) { return h.cause; }).join(' ; ');
    return '<section class="section card card--final" id="s-final"><h2 class="section__title">' + icon('target') + 'Diagnostic final</h2>' +
      (confirmed.length
        ? '<div class="confirmed"><span class="small muted">Cause(s) confirmée(s) par contrôle :</span>' + confirmed.map(function (h) { return ui.chip(h.cause, 'ok', 'check'); }).join('') + '</div>'
        : '<div class="notice notice--warning">' + icon('alert') + '<div>Aucune hypothèse n’est confirmée par un résultat de contrôle : le diagnostic ne peut pas encore être établi.</div></div>') +
      '<form id="final-form" class="form">' +
        '<div class="field"><label for="f-final">Diagnostic final</label><textarea id="f-final" name="finalDiagnosis" rows="3" placeholder="' + esc(suggestion ? 'Ex. ' + suggestion : 'À rédiger une fois la cause confirmée') + '">' + esc(d.finalDiagnosis) + '</textarea>' +
          (suggestion && !d.finalDiagnosis ? '<button type="button" class="btn btn--flat btn--sm" data-action="use-confirmed">' + icon('copy') + 'Reprendre les causes confirmées</button>' : '') + '</div>' +
        '<div class="field"><label for="f-repair">Réparation effectuée</label><textarea id="f-repair" name="repair" rows="3" placeholder="Pièces remplacées, réglages, travaux réalisés…">' + esc(d.repair) + '</textarea></div>' +
        '<div class="field"><label for="f-reco">Recommandations</label><textarea id="f-reco" name="recommendations" rows="3" placeholder="Actions préventives, surveillance, pièces à prévoir…">' + esc(d.recommendations) + '</textarea></div>' +
        '<div class="btnrow">' +
          '<button type="submit" class="btn btn--ghost">' + icon('check') + 'Enregistrer</button>' +
          (closed
            ? '<button type="button" class="btn btn--ghost" data-action="reopen">' + icon('unlock') + 'Rouvrir le diagnostic</button>'
            : '<button type="button" class="btn btn--success" data-action="close-diag"' + (confirmed.length ? '' : ' disabled aria-disabled="true"') + '>' + icon('lock') + 'Clôturer le diagnostic</button>') +
        '</div></form></section>';
  }

  /* ---------- formulaires modaux ---------- */
  function typeTiles(selected) {
    return '<div class="ctype-grid">' + Object.keys(DM.CONTROL_TYPES).map(function (k) {
      const T = DM.CONTROL_TYPES[k];
      return '<label class="ctype ctype--' + T.cls + '"><input type="radio" name="type" value="' + k + '"' + (selected === k ? ' checked' : '') + ' required>' +
        '<span>' + icon(T.icon) + '<b>' + T.label + '</b></span></label>';
    }).join('') + '</div><p class="hint" id="ctype-hint"></p>';
  }
  function bindSafetyPreview(modal, form, d) {
    const box = modal.querySelector('#safety-preview'), hint = modal.querySelector('#ctype-hint');
    function upd() {
      const data = ui.formData(form);
      const type = data.type || data.ctype;
      const desc = data.description != null ? data.description : data.cdescription;
      const exp = data.expected != null ? data.expected : data.cexpected;
      if (hint) hint.textContent = type ? DM.CONTROL_TYPES[type].hint : '';
      if (!type) { box.innerHTML = ''; return; }
      box.innerHTML = ui.safetyBlock(DM.getSafety({ type: type, description: desc, expected: exp }, d.installationType), false);
    }
    form.addEventListener('input', upd);
    form.addEventListener('change', upd);
    upd();
  }

  function hypOptions(d, selected) {
    const out = ['<option value="">Contrôle général (sans hypothèse)</option>'];
    (function walk(hyps, depth) {
      hyps.forEach(function (h) {
        out.push('<option value="' + h.id + '"' + (selected === h.id ? ' selected' : '') + '>' + '— '.repeat(depth) + esc(h.cause) + ' [' + DM.HYP_STATUS[DM.hypothesisState(d, h)].label + ']</option>');
        DM.controlsOf(d, h.id).forEach(function (c) { walk(DM.childHypotheses(d, c.id), depth + 1); });
      });
    })(DM.rootHypotheses(d), 0);
    DM.controlsOf(d, null).forEach(function (c) {
      (function walk(hyps, depth) {
        hyps.forEach(function (h) {
          out.push('<option value="' + h.id + '"' + (selected === h.id ? ' selected' : '') + '>' + '— '.repeat(depth) + esc(h.cause) + '</option>');
          DM.controlsOf(d, h.id).forEach(function (cc) { walk(DM.childHypotheses(d, cc.id), depth + 1); });
        });
      })(DM.childHypotheses(d, c.id), 1);
    });
    return out.join('');
  }

  function controlForm(d, c, hypothesisId) {
    const isNew = !c;
    c = c || { type: '', description: '', expected: '', hypothesisId: hypothesisId || null };
    return ui.modal({
      title: isNew ? 'Ajouter un contrôle' : 'Modifier le contrôle', icon: 'meter',
      body:
        '<div class="field"><label for="m-hyp">Hypothèse vérifiée</label><select id="m-hyp" name="hypothesisId" class="select">' + hypOptions(d, c.hypothesisId) + '</select></div>' +
        '<fieldset class="field"><legend>Nature du contrôle <span class="req">*</span></legend>' + typeTiles(c.type) + '</fieldset>' +
        '<div class="field"><label for="m-desc">Contrôle à effectuer <span class="req">*</span></label><textarea id="m-desc" name="description" rows="3" required placeholder="Ex. Mesurer la tension entre phases aux bornes du moteur">' + esc(c.description) + '</textarea></div>' +
        '<div class="field"><label for="m-exp">Résultat attendu</label><input id="m-exp" name="expected" value="' + esc(c.expected) + '" placeholder="Ex. 400 V ±10 % entre phases"></div>' +
        '<div id="safety-preview"></div>',
      actions: [{ label: 'Annuler', value: null, cls: 'btn--ghost' }, { label: icon('check') + (isNew ? 'Ajouter' : 'Enregistrer'), value: 'ok', cls: 'btn--primary', submit: true }],
      onOpen: function (modal, form) { bindSafetyPreview(modal, form, d); },
      validate: function (data) {
        if (!data.type) return 'Choisissez la nature du contrôle (hors tension, sous tension…).';
        return isNew ? dryRun(d, function (x) { DM.addControl(x, data); }) : dryRun(d, function (x) { DM.updateControl(x, c.id, data); });
      }
    });
  }

  function hypothesisForm(d, h, parentControlId) {
    const isNew = !h;
    h = h || { cause: '', reason: '' };
    const parent = parentControlId ? DM.findControl(d, parentControlId) : null;
    return ui.modal({
      title: isNew ? 'Nouvelle hypothèse' : 'Modifier l’hypothèse', icon: 'branch',
      body:
        (parent ? '<div class="recap"><span class="small muted">Issue du résultat du contrôle :</span><p><strong>' + esc(parent.description) + '</strong></p><p>→ ' + esc(parent.obtained) +
          (parent.measureValue ? ' (' + esc(parent.measureValue + ' ' + parent.measureUnit) + ')' : '') + '</p></div>' : '') +
        '<div class="field"><label for="m-cause">Cause possible <span class="req">*</span></label><input id="m-cause" name="cause" required value="' + esc(h.cause) + '" placeholder="Ex. Condensateur de démarrage hors tolérance"></div>' +
        '<div class="field"><label for="m-reason">Pourquoi cette cause est envisagée</label><textarea id="m-reason" name="reason" rows="3" placeholder="Symptômes ou résultats qui orientent vers cette cause">' + esc(h.reason) + '</textarea></div>' +
        (isNew ? '<details class="details" open><summary>' + icon('meter') + 'Premier contrôle à effectuer (facultatif)</summary>' +
          '<fieldset class="field"><legend>Nature du contrôle</legend>' + typeTiles('').replace(/name="type"/g, 'name="ctype"').replace(/ required>/g, '>') + '</fieldset>' +
          '<div class="field"><label for="m-cdesc">Contrôle à effectuer</label><textarea id="m-cdesc" name="cdescription" rows="2" placeholder="Ex. Mesurer la capacité du condensateur"></textarea></div>' +
          '<div class="field"><label for="m-cexp">Résultat attendu</label><input id="m-cexp" name="cexpected" placeholder="Ex. 35 µF ±5 %"></div>' +
          '<div id="safety-preview"></div></details>' : ''),
      actions: [{ label: 'Annuler', value: null, cls: 'btn--ghost' }, { label: icon('check') + (isNew ? 'Ajouter' : 'Enregistrer'), value: 'ok', cls: 'btn--primary', submit: true }],
      onOpen: function (modal, form) { if (isNew) bindSafetyPreview(modal, form, d); },
      validate: function (data) {
        if (!isNew) return dryRun(d, function (x) { DM.updateHypothesis(x, h.id, data); });
        if (String(data.cdescription || '').trim() && !data.ctype) return 'Choisissez la nature du premier contrôle.';
        if (data.ctype && !String(data.cdescription || '').trim()) return 'Décrivez le premier contrôle à effectuer, ou désélectionnez sa nature.';
        return dryRun(d, function (x) { DM.addHypothesis(x, { cause: data.cause, reason: data.reason, parentControlId: parentControlId }); });
      }
    });
  }

  function concludeForm(d, h, preset) {
    const hasRes = DM.hypothesisHasResult(d, h.id);
    const cur = preset || (h.status === 'confirmee' || h.status === 'ecartee' ? h.status : '');
    const opts = [
      ['confirmee', 'Confirmée', 'ok', 'check', hasRes ? 'La cause est prouvée par le résultat d’un contrôle.' : 'Indisponible : aucun contrôle de cette hypothèse n’a de résultat.'],
      ['ecartee', 'Écartée', 'ko', 'x', 'La cause est exclue' + (hasRes ? ' par le résultat des contrôles.' : ' — justification obligatoire sans résultat de contrôle.')],
      ['a_verifier', 'Non conclue', 'todo', 'info', 'Laisser l’hypothèse ouverte.']
    ];
    const results = DM.controlsOf(d, h.id).filter(DM.hasResult);
    return ui.modal({
      title: 'Conclure l’hypothèse', icon: 'target',
      body: '<div class="recap"><p><strong>' + esc(h.cause) + '</strong></p>' +
        (results.length ? '<ul class="small">' + results.map(function (c) {
          return '<li>' + esc(c.description) + ' → <b>' + esc(c.obtained) + '</b> ' + ui.chip(DM.VERDICTS[c.verdict].label, DM.VERDICTS[c.verdict].cls) + '</li>';
        }).join('') + '</ul>' : '<p class="small muted">Aucun résultat de contrôle.</p>') + '</div>' +
        '<fieldset class="field"><legend>Conclusion <span class="req">*</span></legend><div class="radio-list">' + opts.map(function (o) {
          const dis = o[0] === 'confirmee' && !hasRes;
          return '<label class="radio-card radio-card--' + o[2] + (dis ? ' is-disabled' : '') + '"><input type="radio" name="status" value="' + o[0] + '"' + (cur === o[0] && !dis ? ' checked' : '') + (dis ? ' disabled' : '') + ' required>' +
            '<span>' + icon(o[3]) + '<b>' + o[1] + '</b><small>' + o[4] + '</small></span></label>';
        }).join('') + '</div></fieldset>' +
        '<div class="field"><label for="m-concl">Justification / commentaire</label><textarea id="m-concl" name="conclusion" rows="3" placeholder="Ex. Capacité mesurée 12 µF pour 35 µF nominal">' + esc(h.conclusion) + '</textarea></div>',
      actions: [{ label: 'Annuler', value: null, cls: 'btn--ghost' }, { label: icon('check') + 'Valider', value: 'ok', cls: 'btn--primary', submit: true }],
      validate: function (data) { return dryRun(d, function (x) { DM.concludeHypothesis(x, h.id, data.status, data.conclusion); }); }
    });
  }

  function safetyGate(d, c) {
    const s = DM.getSafety(c, d.installationType);
    if (!s.requireAck || c.safetyAck) return Promise.resolve(true);
    return ui.modal({
      title: 'Avant de réaliser ce contrôle', icon: 'alert', tone: s.level,
      body: '<div class="recap">' + ui.typeBadge(c.type) + '<p><strong>' + esc(c.description) + '</strong></p></div>' + ui.safetyBlock(s, true),
      actions: [{ label: 'Annuler', value: null, cls: 'btn--ghost' },
        { label: icon('shield') + 'Consignes appliquées', value: 'ok', cls: s.level === 'danger' ? 'btn--danger' : 'btn--warning', submit: true }]
    }).then(function (r) {
      if (!r) return false;
      mutate(d.id, function (x) { DM.acknowledgeSafety(x, c.id); }, false);
      return true;
    });
  }

  function resultForm(d, c) {
    const s = DM.getSafety(c, d.installationType);
    return ui.modal({
      title: 'Résultat du contrôle', icon: 'meter',
      body: '<div class="recap">' + ui.typeBadge(c.type) + '<p><strong>' + esc(c.description) + '</strong></p>' +
          (c.expected ? '<p class="small"><span class="muted">Résultat attendu :</span> ' + esc(c.expected) + '</p>' : '') + '</div>' +
        (s.level ? '<div class="safety-mini safety--' + s.level + '">' + icon('shield') + '<span>Consignes de sécurité validées' + (c.safetyAck ? ' le ' + esc(DM.fmtDateTime(c.safetyAck)) : '') + '</span></div>' : '') +
        '<div class="field"><label for="m-obt">Résultat obtenu <span class="req">*</span></label><textarea id="m-obt" name="obtained" rows="3" required placeholder="Ce qui a été constaté ou mesuré">' + esc(c.obtained) + '</textarea></div>' +
        '<div class="grid2 grid2--measure"><div class="field"><label for="m-mv">Mesure</label><input id="m-mv" name="measureValue" inputmode="decimal" value="' + esc(c.measureValue) + '" placeholder="Ex. 228"></div>' +
        '<div class="field"><label for="m-mu">Unité</label><input id="m-mu" name="measureUnit" list="units-list" value="' + esc(c.measureUnit) + '" placeholder="V, A, Ω…"><datalist id="units-list">' +
          UNITS.map(function (u) { return '<option value="' + esc(u) + '">'; }).join('') + '</datalist></div></div>' +
        '<fieldset class="field"><legend>Verdict <span class="req">*</span></legend><div class="seg seg--verdict">' + Object.keys(DM.VERDICTS).map(function (k) {
          const V = DM.VERDICTS[k];
          return '<label class="seg__opt seg__opt--' + V.cls + '"><input type="radio" name="verdict" value="' + k + '"' + (c.verdict === k ? ' checked' : '') + ' required><span>' + V.label + '</span></label>';
        }).join('') + '</div><p class="hint">Conforme = résultat attendu obtenu. Non conforme = écart constaté.</p></fieldset>' +
        '<div class="field"><label for="m-cc">Conclusion du contrôle</label><textarea id="m-cc" name="conclusion" rows="2" placeholder="Interprétation du résultat">' + esc(c.conclusion) + '</textarea></div>',
      actions: (DM.hasResult(c) && !DM.childHypotheses(d, c.id).length ? [{ label: icon('trash') + 'Effacer', value: 'clear', cls: 'btn--danger-ghost' }] : [])
        .concat([{ label: 'Annuler', value: null, cls: 'btn--ghost' }, { label: icon('check') + 'Enregistrer', value: 'ok', cls: 'btn--primary', submit: true }]),
      validate: function (data) { return dryRun(DM.store.get(d.id), function (x) { DM.recordResult(x, c.id, data); }); }
    });
  }

  /** Après un résultat : proposer l'étape suivante de l'arbre. */
  function nextStep(id, controlId) {
    const d = load(id);
    const c = DM.findControl(d, controlId);
    const h = c.hypothesisId ? DM.findHyp(d, c.hypothesisId) : null;
    if (d.status === 'cloture' || (h && (h.status === 'confirmee' || h.status === 'ecartee'))) return Promise.resolve();
    const V = DM.VERDICTS[c.verdict];
    const actions = [{ label: 'Plus tard', value: null, cls: 'btn--ghost' }, { label: icon('branch') + 'Nouvelle hypothèse', value: 'hyp', cls: 'btn--ghost' }];
    if (h && c.verdict === 'non_conforme') actions.push({ label: icon('check') + 'Confirmer l’hypothèse', value: 'confirm', cls: 'btn--success' });
    else if (h && c.verdict === 'conforme') actions.push({ label: icon('x') + 'Écarter l’hypothèse', value: 'discard', cls: 'btn--primary' });
    else if (h) actions.push({ label: icon('plus') + 'Autre contrôle', value: 'control', cls: 'btn--primary' });
    const msg = !h ? 'Ce résultat oriente-t-il vers une nouvelle hypothèse ?'
      : c.verdict === 'non_conforme' ? 'Le résultat est non conforme : l’hypothèse « ' + h.cause + ' » peut être confirmée, ou approfondie par une nouvelle hypothèse.'
      : c.verdict === 'conforme' ? 'Le résultat est conforme : l’hypothèse « ' + h.cause + ' » peut être écartée, ou le résultat peut orienter vers une autre piste.'
      : 'Le résultat est indéterminé : un contrôle complémentaire est conseillé.';
    return ui.modal({
      title: 'Étape suivante', icon: 'branch',
      body: '<div class="recap"><p>' + ui.chip(V.label, V.cls) + ' ' + esc(c.obtained) + '</p></div><p>' + esc(msg) + '</p>',
      actions: actions
    }).then(function (r) {
      if (!r) return;
      const dd = load(id);
      if (r.value === 'hyp') return addHypFlow(dd, controlId);
      if (r.value === 'confirm') return concludeFlow(dd, h.id, 'confirmee');
      if (r.value === 'discard') return concludeFlow(dd, h.id, 'ecartee');
      if (r.value === 'control') return addControlFlow(dd, h.id);
    });
  }

  /* ---------- flux ---------- */
  function addControlFlow(d, hypothesisId) {
    return controlForm(d, null, hypothesisId).then(function (r) {
      if (!r) return;
      const c = mutate(d.id, function (x) { return DM.addControl(x, r.data); });
      ui.toast('Contrôle ajouté', 'success');
      scrollToEl(c.id);
    });
  }
  function addHypFlow(d, parentControlId) {
    return hypothesisForm(d, null, parentControlId).then(function (r) {
      if (!r) return;
      const h = mutate(d.id, function (x) {
        const hyp = DM.addHypothesis(x, { cause: r.data.cause, reason: r.data.reason, parentControlId: parentControlId || null });
        if (r.data.ctype && String(r.data.cdescription || '').trim()) {
          DM.addControl(x, { hypothesisId: hyp.id, type: r.data.ctype, description: r.data.cdescription, expected: r.data.cexpected });
        }
        return hyp;
      });
      ui.toast('Hypothèse ajoutée', 'success');
      scrollToEl(h.id);
    });
  }
  function concludeFlow(d, hid, preset) {
    const h = DM.findHyp(d, hid);
    return concludeForm(d, h, preset).then(function (r) {
      if (!r) return;
      mutate(d.id, function (x) { DM.concludeHypothesis(x, hid, r.data.status, r.data.conclusion); });
      ui.toast('Hypothèse ' + DM.HYP_STATUS[DM.hypothesisState(load(d.id), DM.findHyp(load(d.id), hid))].label.toLowerCase(), 'success');
      if (r.data.status === 'confirmee') scrollToEl('s-final'); else scrollToEl(hid);
    });
  }

  /* ---------- vue ---------- */
  DM.views.diag = {
    render: function (params) {
      const d = DM.store.get(params.id);
      if (!d) return ui.notFound();
      const S = DM.DIAG_STATUS[d.status];
      const idq = encodeURIComponent(d.id);
      return {
        title: d.name,
        back: '#/historique',
        actions: '<a class="btn btn--icon btn--flat" href="#/diag/' + idq + '/rapport" aria-label="Compte-rendu" title="Compte-rendu">' + icon('file') + '</a>',
        fab: '<button type="button" class="fab" data-action="add-control" aria-label="Ajouter un contrôle">' + icon('plus') + '<span>Contrôle</span></button>',
        html:
          '<div class="diag-head">' + ui.chip(S.label, S.cls, d.status === 'cloture' ? 'lock' : 'wrench') +
            '<span class="small muted">' + icon('calendar') + esc(DM.fmtDate(d.date)) + '</span>' +
            '<span class="small muted">' + DM.reportNumber(d) + '</span></div>' +
          stepper(d) +
          infoSections(d) +
          treeSection(d) +
          finalSection(d) +
          '<a class="btn btn--primary btn--xl btn--block" href="#/diag/' + idq + '/rapport">' + icon('file') + 'Générer le compte-rendu</a>' +
          '<div class="btnrow btnrow--center">' +
            '<a class="btn btn--ghost" href="#/diag/' + idq + '/modifier">' + icon('edit') + 'Modifier</a>' +
            '<button type="button" class="btn btn--ghost" data-action="duplicate">' + icon('copy') + 'Dupliquer</button>' +
            '<button type="button" class="btn btn--danger-ghost" data-action="delete">' + icon('trash') + 'Supprimer</button>' +
          '</div>'
      };
    },

    mount: function (root, params) {
      const box = root.querySelector('#diag-photos');
      if (box) {
        ui.hydratePhotos(box);
        ui.bindPhotoInputs(box, params.id, function (ids) {
          mutate(params.id, function (d) {
            ids.forEach(function (id) { d.photos.push({ id: id, caption: '', addedAt: new Date().toISOString() }); });
          });
        });
      }
      const ff = root.querySelector('#final-form');
      if (ff) {
        ff.addEventListener('submit', function (e) {
          e.preventDefault();
          mutate(params.id, function () {}, false);
          ui.toast('Diagnostic final enregistré', 'success');
        });
        // enregistrement automatique à la sortie d'un champ
        ff.addEventListener('change', function () { mutate(params.id, function () {}, false); });
      }
    },

    actions: {
      'toggle-suggest': function (el, e, p) {
        const d = load(p.id);
        const cur = suggestOpen[p.id] !== undefined ? suggestOpen[p.id] : d.hypotheses.length === 0;
        suggestOpen[p.id] = !cur;
        mutate(p.id, function () {});
      },
      'suggest-all': function (el, e, p) { suggestAll[p.id] = !suggestAll[p.id]; mutate(p.id, function () {}); },
      'add-suggestion': function (el, e, p) {
        const tpl = DM.findTemplate(el.dataset.tpl);
        if (!tpl) return;
        const d = load(p.id);
        const s = DM.suggestHypotheses(d).find(function (x) { return x.template.id === tpl.id; });
        const h = mutate(p.id, function (x) {
          const reason = tpl.reason + (s && s.matched.length ? '\nIndices relevés dans la description : ' + s.matched.join(', ') + '.' : '');
          const hyp = DM.addHypothesis(x, { cause: tpl.cause, reason: reason, origin: 'assistant' });
          tpl.controls.forEach(function (c) { DM.addControl(x, { hypothesisId: hyp.id, type: c.type, description: c.description, expected: c.expected }); });
          return hyp;
        });
        ui.toast('Hypothèse ajoutée avec ' + DM.plural(tpl.controls.length, 'contrôle'), 'success');
        scrollToEl(h.id);
      },
      'add-hyp': function (el, e, p) { return addHypFlow(load(p.id), el.dataset.control || null); },
      'edit-hyp': function (el, e, p) {
        const d = load(p.id), h = DM.findHyp(d, el.dataset.id);
        return hypothesisForm(d, h).then(function (r) {
          if (!r) return;
          mutate(p.id, function (x) { DM.updateHypothesis(x, h.id, r.data); });
          ui.toast('Hypothèse modifiée', 'success');
        });
      },
      'delete-hyp': function (el, e, p) {
        const d = load(p.id), h = DM.findHyp(d, el.dataset.id);
        const n = DM.removeHypothesis(DM.clone(d), h.id);
        return ui.confirm('Supprimer l’hypothèse « ' + h.cause + ' » ?', {
          title: 'Supprimer', danger: true, okLabel: 'Supprimer',
          detail: 'Seront aussi supprimés : ' + DM.plural(n.controls, 'contrôle') + (n.hypotheses > 1 ? ' et ' + DM.plural(n.hypotheses - 1, 'hypothèse dérivée', 'hypothèses dérivées') : '') + '.'
        }).then(function (ok) {
          if (!ok) return;
          mutate(p.id, function (x) { DM.removeHypothesis(x, h.id); });
          ui.toast('Hypothèse supprimée', 'success');
        });
      },
      'conclude-hyp': function (el, e, p) { return concludeFlow(load(p.id), el.dataset.id, el.dataset.preset); },
      'add-control': function (el, e, p) { return addControlFlow(load(p.id), el.dataset.hyp || null); },
      'edit-control': function (el, e, p) {
        const d = load(p.id), c = DM.findControl(d, el.dataset.id);
        return controlForm(d, c).then(function (r) {
          if (!r) return;
          mutate(p.id, function (x) { DM.updateControl(x, c.id, r.data); });
          ui.toast('Contrôle modifié', 'success');
        });
      },
      'delete-control': function (el, e, p) {
        const d = load(p.id), c = DM.findControl(d, el.dataset.id);
        const n = DM.removeControl(DM.clone(d), c.id);
        return ui.confirm('Supprimer ce contrôle ?', {
          title: 'Supprimer', danger: true, okLabel: 'Supprimer',
          detail: c.description + (n.hypotheses ? ' — ' + DM.plural(n.hypotheses, 'hypothèse issue', 'hypothèses issues') + ' de ce résultat seront aussi supprimées.' : '')
        }).then(function (ok) {
          if (!ok) return;
          mutate(p.id, function (x) { DM.removeControl(x, c.id); });
          ui.toast('Contrôle supprimé', 'success');
        });
      },
      'record': function (el, e, p) {
        const id = el.dataset.id;
        return safetyGate(load(p.id), DM.findControl(load(p.id), id)).then(function (ok) {
          if (!ok) return;
          const d = load(p.id);
          return resultForm(d, DM.findControl(d, id)).then(function (r) {
            if (!r) { DM.app.refresh(); return; }
            if (r.value === 'clear') {
              mutate(p.id, function (x) { DM.clearResult(x, id); });
              ui.toast('Résultat effacé');
              return;
            }
            mutate(p.id, function (x) { DM.recordResult(x, id, r.data); });
            ui.toast('Résultat enregistré', 'success');
            scrollToEl(id);
            return nextStep(p.id, id);
          });
        });
      },
      'use-confirmed': function (el, e, p) {
        const d = load(p.id);
        const ta = document.getElementById('f-final');
        ta.value = DM.confirmedHypotheses(d).map(function (h) { return h.cause + (h.conclusion ? ' : ' + h.conclusion : ''); }).join('\n');
        mutate(p.id, function () {}, false);
        el.remove();
        ta.focus();
      },
      'close-diag': function (el, e, p) {
        const f = document.getElementById('final-form');
        const data = ui.formData(f);
        const err = dryRun(load(p.id), function (x) { DM.closeDiagnostic(x, data); });
        if (err) { ui.toast(err, 'error'); if (!data.finalDiagnosis) document.getElementById('f-final').focus(); return; }
        mutate(p.id, function (x) { DM.closeDiagnostic(x, data); });
        ui.toast('Diagnostic clôturé', 'success');
        window.scrollTo(0, 0);
      },
      'reopen': function (el, e, p) {
        mutate(p.id, function (x) { DM.reopenDiagnostic(x); });
        ui.toast('Diagnostic rouvert');
      },
      'photo-view': function (el, e, p) {
        const d = load(p.id);
        const ph = d.photos.find(function (x) { return x.id === el.dataset.photo; });
        if (!ph) return;
        return ui.viewPhoto(ph).then(function (r) {
          if (!r) return;
          if (r === 'delete') {
            return ui.confirm('Supprimer cette photo ?', { danger: true, okLabel: 'Supprimer' }).then(function (ok) {
              if (!ok) return;
              mutate(p.id, function (x) { x.photos = x.photos.filter(function (y) { return y.id !== ph.id; }); });
              DM.photos.remove(ph.id);
              ui.toast('Photo supprimée', 'success');
            });
          }
          mutate(p.id, function (x) { x.photos.forEach(function (y) { if (y.id === ph.id) y.caption = r.caption; }); });
        });
      },
      'duplicate': function (el, e, p) {
        return DM.ops.duplicate(p.id).then(function (copy) {
          ui.toast('Copie créée', 'success');
          DM.app.go('/diag/' + encodeURIComponent(copy.id));
        });
      },
      'delete': function (el, e, p) {
        return DM.ops.confirmDelete(p.id).then(function (ok) { if (ok) DM.app.go('/historique'); });
      }
    }
  };
})(window.DM);
