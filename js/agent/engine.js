/* DIAG-MAINT — moteur de l'agent : contexte, boucle d'outils, traces. Sans DOM : navigateur + Node.
 *
 * Un tour = le dernier message du technicien (déjà ajouté à diag.messages) → réponse de l'agent.
 * Le serveur est sans état : il reçoit le diagnostic, renvoie le diagnostic mis à jour.
 * Fournisseur : objet { name, complete({system, messages, tools, serverTools, context}) → {content, stop_reason, usage, model} }
 * au format Messages API d'Anthropic (blocs text / tool_use / tool_result / image / document…).
 */
(function (DM) {
  'use strict';

  DM.agent = DM.agent || {};
  const HISTORY_LIMIT = 30;       // messages de conversation renvoyés à l'IA (l'état complet est dans l'instantané)
  const MAX_ITERATIONS = 14;
  const LOOKUP_TOOLS = ['search_previous_diagnostics', 'search_documentation', 'read_document', 'analyze_image'];  // leur résultat doit être lu par l'IA
  const MIN_DIRECT_REPLY = 60;    // en dessous, le texte est une simple transition, pas la réponse
  const SHORT_REPLY = 220;        // une réponse plus courte est probablement réduite à la question

  function s(v) { return v == null ? '' : String(v).trim(); }

  /** La fin de la réponse pose-t-elle déjà la question (mêmes mots, ou une phrase interrogative) ? */
  function asksAlready(reply, question) {
    if (reply.indexOf(question) !== -1 || /\?\s*\**\s*$/.test(reply)) return true;
    const tail = DM.normText(reply.slice(-350));
    const words = DM.normText(question).trim().split(' ').filter(function (w) { return w.length > 3; });
    if (words.length < 3) return false;
    return words.filter(function (w) { return tail.indexOf(' ' + w) !== -1; }).length / words.length >= 0.6;
  }

  /** Erreur normalisée renvoyée au client (code stable + message en français). */
  DM.agent.AgentError = function (code, message, retryable) {
    const e = new Error(message);
    e.name = 'AgentError';
    e.code = code;
    e.retryable = !!retryable;
    return e;
  };

  /* ---------- instantané de l'état ---------- */
  DM.agent.snapshot = function (d) {
    const L = [];
    const T = DM.installType(d.installationType);
    L.push('<etat_du_diagnostic id="' + d.id + '">');
    L.push('Date : ' + DM.fmtDate(d.date) + ' — statut : ' + DM.DIAG_STATUS[d.status].label);
    L.push('Matériel : type=' + (d.installationType === 'autre' ? 'non précisé' : T.label) +
      ' ; marque=' + (d.brand || '?') + ' ; modèle=' + (d.model || '?') + ' ; référence=' + (d.reference || '?') +
      (d.serial ? ' ; n° série=' + d.serial : '') + (d.site || d.client ? ' ; site/client=' + [d.site, d.client].filter(Boolean).join(' / ') : '') +
      (d.location ? ' ; emplacement=' + d.location : ''));
    L.push('Panne : ' + (d.description || '(pas encore décrite)'));
    const sy = DM.symptomList(d);
    L.push('Symptômes : ' + (sy.length ? sy.join(' ; ') : '(aucun)'));
    L.push('Faits connus (ne jamais reposer ces questions) :');
    if (!d.facts.length) L.push('- (aucun)');
    d.facts.forEach(function (f) { L.push('- [' + f.id + '] ' + f.question + ' → ' + f.answer + ' (source : ' + f.source + ')'); });

    function ctlLine(c, indent) {
      const r = DM.riskLevel(c, d.installationType);
      const res = DM.hasResult(c) ? 'RÉSULTAT : ' + c.obtained + ' (' + DM.VERDICTS[c.verdict].label + ')' + (c.conclusion ? ' — ' + c.conclusion : '') : 'À RÉALISER';
      const mes = DM.measurementsOf(d, c.id).map(function (m) { return m.value + (m.unit ? ' ' + m.unit : ''); });
      return indent + '- Contrôle [' + c.id + '] ' + DM.CONTROL_TYPES[c.type].short + ', risque N' + r.level + ' : ' + c.description +
        (c.expected ? ' ; attendu : ' + c.expected : '') + (mes.length ? ' ; mesures : ' + mes.join(', ') : '') + ' ; ' + res;
    }
    function hypLines(h, indent) {
      L.push(indent + '- [' + h.id + '] ' + h.cause + ' — statut : ' + DM.HYP_STATUS[h.status].label.toLowerCase() +
        (h.reason ? ' ; raison : ' + h.reason : ''));
      if (h.evidence.length) L.push(indent + '  preuves : ' + h.evidence.map(function (e) { return e.text; }).join(' | '));
      if (h.counterEvidence.length) L.push(indent + '  contre-preuves : ' + h.counterEvidence.map(function (e) { return e.text; }).join(' | '));
      DM.controlsOf(d, h.id).forEach(function (c) {
        L.push(ctlLine(c, indent + '  '));
        DM.childHypotheses(d, c.id).forEach(function (k) { hypLines(k, indent + '    '); });
      });
    }
    L.push('Hypothèses :');
    if (!d.hypotheses.length) L.push('- (aucune)');
    DM.rootHypotheses(d).forEach(function (h) { hypLines(h, ''); });
    const general = DM.controlsOf(d, null);
    if (general.length) {
      L.push('Contrôles généraux :');
      general.forEach(function (c) { L.push(ctlLine(c, '')); DM.childHypotheses(d, c.id).forEach(function (k) { hypLines(k, '  '); }); });
    }
    L.push('Mesures :');
    if (!d.measurements.length) L.push('- (aucune)');
    d.measurements.forEach(function (m) {
      L.push('- [' + m.id + '] ' + DM.fmtDateTime(m.at) + ' ' + DM.formatMeasurement(m) +
        (m.controlId ? ' — contrôle ' + m.controlId : '') + (m.result ? ' — ' + DM.VERDICTS[m.result].label : '') + (m.comment ? ' — ' + m.comment : ''));
    });
    L.push('Photos :');
    if (!d.photos.length) L.push('- (aucune)');
    d.photos.forEach(function (p) {
      L.push('- [' + p.id + '] ' + (DM.PHOTO_KINDS[p.kind] || 'photo') + (p.caption ? ' « ' + p.caption + ' »' : '') +
        ' — ' + (p.analysis ? 'analyse : ' + p.analysis.text.replace(/\n/g, ' ') : 'non analysée'));
    });
    if (d.documents.length) {
      L.push('Documents liés :');
      d.documents.forEach(function (x) { L.push('- [' + x.id + '] ' + x.title); });
    }
    L.push('Verdict actuel : ' + DM.VERDICT_STATUS[d.verdict.status].label + (d.verdict.summary ? ' — ' + d.verdict.summary : '') +
      (d.verdict.missing.length ? ' ; manque : ' + d.verdict.missing.join(' ; ') : ''));
    if (d.repair) L.push('Réparation : ' + d.repair);
    L.push('</etat_du_diagnostic>');
    return L.join('\n');
  };

  /** Texte d'un message de l'historique (pièces jointes résumées). */
  function historyText(d, m) {
    let t = m.text || '';
    (m.attachments || []).forEach(function (a) {
      if (a.type === 'photo') {
        const p = d.photos.find(function (x) { return x.id === a.id; });
        t += '\n[Photo jointe ' + a.id + (p ? ' — ' + (DM.PHOTO_KINDS[p.kind] || '') : '') + ']';
      } else if (a.type === 'measurement') {
        const mm = DM.findMeasurement(d, a.id);
        if (mm) t += '\n[Mesure ' + a.id + ' : ' + DM.formatMeasurement(mm) + ']';
      } else if (a.type === 'document') t += '\n[Document ajouté ' + a.id + ']';
      else if (a.type === 'control') t += '\n[Contrôle effectué ' + a.id + ']';
    });
    if (m.role === 'assistant' && m.ask && m.ask.question && t.indexOf(m.ask.question) === -1) t += '\n' + m.ask.question;
    return t.trim() || '(vide)';
  }

  /**
   * Messages envoyés au modèle : historique en texte + dernier message du technicien enrichi de
   * l'instantané d'état et des images jointes.
   * @param {object} images { photoId: {mediaType, data} } pour les photos jointes au dernier message
   */
  DM.agent.buildMessages = function (d, images) {
    const all = d.messages.filter(function (m) { return !m.error || m.role === 'user'; });
    const current = all[all.length - 1];
    if (!current || current.role !== 'user') throw DM.agent.AgentError('no_user_message', 'Aucun message du technicien à traiter.', false);
    const history = all.slice(0, -1).slice(-HISTORY_LIMIT);
    const msgs = [];
    history.forEach(function (m) {
      const text = historyText(d, m);
      const last = msgs[msgs.length - 1];
      if (last && last.role === m.role) last.content += '\n\n' + text;
      else msgs.push({ role: m.role, content: text });
    });
    while (msgs.length && msgs[0].role !== 'user') msgs.shift();

    const content = [{ type: 'text', text: DM.agent.snapshot(d) }];
    (current.attachments || []).forEach(function (a) {
      if (a.type === 'photo' && images && images[a.id]) {
        const p = d.photos.find(function (x) { return x.id === a.id; });
        content.push({ type: 'text', text: 'Photo ' + a.id + ' (' + (p ? DM.PHOTO_KINDS[p.kind] || 'photo' : 'photo') + (p && p.caption ? ' — ' + p.caption : '') + ') :' });
        content.push({ type: 'image', source: { type: 'base64', media_type: images[a.id].mediaType || 'image/jpeg', data: images[a.id].data } });
      }
    });
    content.push({ type: 'text', text: 'Message du technicien :\n' + historyText(d, current) });
    const last = msgs[msgs.length - 1];
    if (last && last.role === 'user') {
      // deux messages utilisateur consécutifs (tour précédent en erreur) : on les regroupe
      content.unshift({ type: 'text', text: last.content });
      msgs.pop();
    }
    msgs.push({ role: 'user', content: content });
    return msgs;
  };

  /* ---------- traces des outils serveur (recherche Web) ---------- */
  function serverTrace(block, all) {
    if (block.type === 'server_tool_use' && block.name === 'web_search') {
      const res = all.find(function (b) { return b.type === 'web_search_tool_result' && b.tool_use_id === block.id; });
      const items = res && Array.isArray(res.content) ? res.content.filter(function (x) { return x.type === 'web_search_result'; }) : [];
      return {
        kind: 'web', label: 'Recherche Web effectuée', detail: s(block.input && block.input.query),
        sources: items.slice(0, 5).map(function (x) { return { title: x.title, url: x.url }; }),
        error: res && res.content && !Array.isArray(res.content) ? res.content.error_code : null
      };
    }
    if (block.type === 'server_tool_use' && block.name === 'web_fetch') {
      const url = s(block.input && block.input.url);
      return { kind: 'web', label: 'Page consultée', detail: url, sources: url ? [{ title: url, url: url }] : [] };
    }
    return null;
  }
  /** Sources citées dans le texte final (citations des recherches Web). */
  function citedSources(content) {
    const out = [];
    content.forEach(function (b) {
      (b.type === 'text' && Array.isArray(b.citations) ? b.citations : []).forEach(function (c) {
        if (c.url && !out.some(function (o) { return o.url === c.url; })) out.push({ title: c.title || c.url, url: c.url });
      });
    });
    return out;
  }

  /**
   * Exécute un tour d'agent.
   * @param {object} p { provider, diag, system, services, images, maxIterations, onEvent }
   * @returns {Promise<{diag, reply, ask, trace, suggestReport, usage, iterations, engine}>}
   */
  DM.agent.runTurn = async function (p) {
    const provider = p.provider;
    const d = DM.normalizeDiag(DM.clone(p.diag));
    const current = d.messages[d.messages.length - 1];
    if (!current || current.role !== 'user') throw DM.agent.AgentError('no_user_message', 'Aucun message du technicien à traiter.', false);
    const services = p.services || {};
    const toolNames = DM.agent.availableTools(services).filter(function (n) {
      return !provider.supportsTool || provider.supportsTool(n);
    });
    const tools = DM.agent.toolDefs(toolNames);
    const turn = { ask: null, trace: [], attachments: [], suggestReport: false, proposedControlId: null };
    const ctx = { diag: d, turn: turn, services: services, userText: current.text };
    const messages = DM.agent.buildMessages(d, p.images);
    // Premier message : l'historique des pannes similaires est joint d'office, pour éviter à l'IA un aller-retour de recherche.
    if (provider.name !== 'local' && services.knowledge && DM.kb && d.messages.filter(function (m) { return m.role === 'user'; }).length === 1) {
      try {
        const entries = await services.knowledge.entries();
        const found = DM.kb.search(entries, { mode: 'similaire', text: current.text, installationType: d.installationType, brand: d.brand, excludeDiagId: d.id, limit: 3 });
        const last = messages[messages.length - 1];
        last.content.push({ type: 'text', text: '<historique_similaire>\n' + (found.length
          ? found.map(function (r) { return '- ' + DM.kb.summary(r.entry) + ' [' + r.why.join(', ') + ']'; }).join('\n')
          : 'Aucun diagnostic antérieur similaire.') + '\n</historique_similaire>' });
        turn.trace.push({ kind: 'knowledge', label: 'Recherche dans l’historique (' + DM.KB_MODES.similaire + ')', detail: found.length ? DM.plural(found.length, 'résultat') : 'aucun résultat' });
      } catch (e) { /* historique indisponible : l'IA peut toujours le chercher elle-même */ }
    }
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 };
    const max = p.maxIterations || MAX_ITERATIONS;
    let reply = '', i = 0, finalContent = [];
    const turnStart = new Date().toISOString();
    const preTexts = [];   // textes écrits par l'IA en même temps que ses appels d'outils
    // contrôle dont le technicien était censé donner le résultat (question du message précédent)
    const prevAssistant = d.messages.slice(0, -1).reverse().find(function (m) { return m.role === 'assistant'; });
    const awaitedControlId = prevAssistant && prevAssistant.ask && prevAssistant.ask.kind === 'result'
      ? (prevAssistant.ask.controlId || prevAssistant.controlId || null) : null;

    for (i = 1; i <= max; i++) {
      // diffusion du texte au fil de l'eau : à chaque nouvel appel à l'IA, le texte déjà affiché est remplacé
      if (p.onText && i > 1) p.onText(null);
      const res = await provider.complete({ system: p.system || '', messages: messages, tools: tools, context: { diag: d, turn: turn },
        onText: p.onText ? function (delta) { p.onText(delta); } : undefined });
      ['input_tokens', 'output_tokens', 'cache_read_input_tokens'].forEach(function (k) { usage[k] += (res.usage && res.usage[k]) || 0; });
      const content = res.content || [];
      content.forEach(function (b) { const t = serverTrace(b, content); if (t) turn.trace.push(t); });

      if (res.stop_reason === 'refusal') {
        reply = 'Je ne peux pas traiter cette demande telle quelle. Reformule-la en décrivant la panne et les constats sur le matériel.';
        finalContent = [];
        break;
      }
      if (res.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: content });
        continue;
      }
      const toolUses = content.filter(function (b) { return b.type === 'tool_use'; });
      if (res.stop_reason === 'tool_use' && toolUses.length) {
        messages.push({ role: 'assistant', content: content });
        const results = [];
        turn.attachments = [];
        let anyError = false;
        for (const tu of toolUses) {
          const out = await DM.agent.runTool(tu.name, tu.input, ctx);
          if (out.trace) turn.trace.push(out.trace);
          if (out.isError) anyError = true;
          if (p.onEvent) p.onEvent({ type: 'tool', name: tu.name, isError: !!out.isError });
          results.push({ type: 'tool_result', tool_use_id: tu.id, content: out.content, is_error: out.isError || undefined });
        }
        // Réponse en un seul passage : l'IA a écrit sa réponse puis appelé tous ses outils, dont la question finale.
        // Si aucun outil n'a été refusé et qu'aucun ne rapporte une information à lire, inutile de la rappeler.
        const said = content.filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('').trim();
        if (said) preTexts.push(said);
        const closes = toolUses.some(function (tu) { return tu.name === 'ask_user' || tu.name === 'suggest_report'; });
        const reads = toolUses.some(function (tu) { return LOOKUP_TOOLS.indexOf(tu.name) !== -1; });
        if (said.length >= MIN_DIRECT_REPLY && closes && !reads && !anyError) {
          finalContent = content;
          reply = said;
          if (turn.ask && turn.ask.question && !asksAlready(reply, turn.ask.question)) reply += '\n\n' + turn.ask.question;
          break;
        }
        // documents ouverts par read_document : joints après les résultats d'outils
        const followUp = results.concat(turn.attachments);
        // le texte écrit avec ces appels d'outils n'est pas affiché : l'IA doit rendre une réponse complète au tour suivant
        if (said) {
          followUp.push({ type: 'text', text: (anyError ? 'Un outil a été refusé : corrige ce qui doit l’être. ' : '') +
            'Le texte que tu as écrit avant ces appels d’outils n’a PAS été montré au technicien. Écris maintenant ta réponse complète pour lui ' +
            '(ce que tu retiens, le prochain contrôle ou la conclusion, la question), cohérente avec l’état réellement enregistré.' });
        }
        messages.push({ role: 'user', content: followUp });
        continue;
      }
      if (res.stop_reason === 'max_tokens') throw DM.agent.AgentError('truncated', 'Réponse de l’IA tronquée (limite de longueur).', true);
      finalContent = content;
      reply = content.filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('').trim();
      break;
    }
    if (i > max) {
      reply = reply || 'J’ai atteint la limite d’étapes pour ce tour. Voici où j’en suis : consulte le panneau de diagnostic, puis relance-moi.';
    }
    const sources = citedSources(finalContent);
    if (sources.length) {
      const web = turn.trace.filter(function (t) { return t.kind === 'web'; });
      const target = web[web.length - 1];
      if (target) sources.forEach(function (src) { if (!target.sources.some(function (x) { return x.url === src.url; })) target.sources.push(src); });
      else turn.trace.push({ kind: 'web', label: 'Sources citées', detail: '', sources: sources });
    }
    if (!reply) reply = turn.ask ? turn.ask.question : 'D’accord.';
    // l'explication a parfois été écrite avant les appels d'outils, et la réponse finale réduite à la question :
    // on rend alors l'explication, suivie de la question
    const best = preTexts.reduce(function (a, b) { return b.length > a.length ? b : a; }, '');
    if (best && reply.length < SHORT_REPLY && best.length > 2 * reply.length && best.indexOf(reply) === -1) reply = best + '\n\n' + reply;

    // Toutes les valeurs données en réponse à un contrôle sont au relevé, même si l'IA n'en a enregistré qu'une partie.
    if (provider.name !== 'local' && awaitedControlId && DM.agent.parseMeasurements) {
      const ctl = DM.findControl(d, awaitedControlId);
      const family = function (k) { return k === 'isolement' ? 'resistance' : k; };
      const digits = function (v) { return String(v).replace(',', '.').replace(/[^0-9.]/g, ''); };
      const kinds = ctl ? DM.controlMeasureKinds(ctl).map(family) : [];
      if (kinds.length) {
        DM.agent.parseMeasurements(current.text).forEach(function (m) {
          const kind = DM.kindFromUnit(m.unit);
          if (kinds.indexOf(family(kind)) === -1) return;
          const known = d.measurements.some(function (x) {
            return (x.at >= turnStart || x.controlId === ctl.id) && digits(x.value) === digits(m.value) && DM.normalize(x.unit) === DM.normalize(m.unit);
          });
          if (known) return;
          const added = DM.addMeasurement(d, {
            kind: kind, label: (m.label ? m.label + ' — ' : '') + ctl.description.slice(0, 60), value: m.value, unit: m.unit,
            controlId: ctl.id, source: 'technicien', comment: 'Relevée automatiquement dans le message du technicien'
          });
          turn.trace.push({ kind: 'measurement', label: 'Mesure enregistrée', detail: DM.formatMeasurement(added) });
        });
      }
    }
    // compléments propres au fournisseur (ex. moteur local : identifiant de question, hypothèse à confirmer)
    if (provider.extraAsk && turn.ask) Object.assign(turn.ask, provider.extraAsk);

    current.pending = false;
    current.error = null;
    // le contrôle rattaché au message : celui sur lequel porte la question finale, sinon le dernier proposé
    const askedControl = turn.ask && turn.ask.controlId && DM.findControl(d, turn.ask.controlId) ? turn.ask.controlId : null;
    DM.addMessage(d, {
      role: 'assistant', text: reply, trace: turn.trace, ask: turn.ask,
      controlId: askedControl || turn.proposedControlId, engine: provider.name
    });
    return {
      diag: d, reply: reply, ask: turn.ask, trace: turn.trace, suggestReport: turn.suggestReport,
      usage: usage, iterations: i, engine: provider.name
    };
  };
})(window.DM);
