/* DIAG-MAINT — outils de l'agent (définitions + exécution). Sans DOM : navigateur + Node.
 *
 * Chaque outil : { def: {name, description, input_schema}, needs: [services requis], run(input, ctx) }.
 * ctx = { diag (état de travail, modifié en place), turn (collecte : ask, trace, attachments, flags),
 *         services: { knowledge, documents, images }, userText }
 * run() renvoie { content: string | blocs, isError?, trace?: {kind, label, detail, sources?} }.
 *
 * Les règles de preuve et de sécurité sont vérifiées ici, dans le code : l'IA ne peut pas les contourner.
 */
(function (DM) {
  'use strict';

  DM.agent = DM.agent || {};
  const CONTROL_TYPES = ['hors_tension', 'sous_tension', 'fluide', 'fonctionnel', 'visuel'];
  const HYP_STATUSES = ['possible', 'suspectee', 'ecartee', 'confirmee'];

  function s(v) { return v == null ? '' : String(v).trim(); }
  function list(v) { return Array.isArray(v) ? v.map(s).filter(Boolean) : (s(v) ? [s(v)] : []); }
  function ok(content, trace) { return { content: typeof content === 'string' ? content : JSON.stringify(content), trace: trace || null }; }
  function fail(msg) { return { content: msg, isError: true }; }
  const STOP = ['qui', 'que', 'quoi', 'les', 'des', 'une', 'est', 'elle', 'pas', 'sur', 'aux', 'avec', 'dans', 'pour', 'par', 'son', 'ses',
    'cette', 'votre', 'ton', 'tes', 'quel', 'quelle', 'quels', 'quelles', 'combien', 'bout', 'aussi', 'egalement'];
  function wordsOf(t) {
    return DM.normText(t).trim().split(' ').filter(function (w) { return w.length > 2 && STOP.indexOf(w) === -1; });
  }
  /** Recouvrement des mots significatifs (0..1), rapporté au plus long des deux textes. */
  function overlap(a, b) {
    const A = wordsOf(a), B = wordsOf(b);
    if (A.length < 2 || B.length < 2) return 0;
    const common = A.filter(function (w) { return B.indexOf(w) !== -1; }).length;
    return common / Math.max(A.length, B.length);
  }
  /** Chiffres d'une valeur, normalisés (virgule/point) pour vérifier qu'elle a bien été dite. */
  function digitsOf(v) { return String(v).replace(',', '.').replace(/[^0-9.]/g, '').replace(/^\.+|\.+$/g, ''); }

  const T = {};

  T.ask_user = {
    def: {
      name: 'ask_user',
      description: 'Pose au technicien UNE seule question courte (celle qui termine ta réponse), avec au plus 4 réponses rapides. ' +
        'N’utilise jamais cet outil pour une information déjà présente dans les faits connus. ' +
        'Utilise kind="result" avec control_id quand tu attends le résultat d’un contrôle.',
      input_schema: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'La question, courte.' },
          choices: { type: 'array', items: { type: 'string' }, description: 'Réponses rapides (0 à 4), ex. ["Oui","Non","Je ne sais pas"].' },
          kind: { type: 'string', enum: ['fact', 'result', 'verdict', 'confirm', 'open'] },
          control_id: { type: 'string' }
        },
        required: ['question']
      }
    },
    run: function (input, ctx) {
      const q = s(input.question);
      if (!q) return fail('Question vide.');
      const known = ctx.diag.facts.find(function (f) { return overlap(f.question, q) >= 0.6; });
      if (known && input.kind !== 'result' && input.kind !== 'verdict') {
        return fail('Déjà connu : « ' + known.question + ' » → « ' + known.answer + ' ». Ne repose pas cette question ; utilise ce fait.');
      }
      ctx.turn.ask = { question: q, choices: list(input.choices).slice(0, 4), kind: input.kind || 'open', controlId: input.control_id || null };
      return ok('Question enregistrée ; termine ta réponse en la posant.');
    }
  };

  T.record_fact = {
    def: {
      name: 'record_fact',
      description: 'Mémorise un fait établi (réponse du technicien, information lue sur une photo ou un document). ' +
        'Un fait mémorisé ne doit plus jamais être redemandé. Formule la question/le sujet de façon générique.',
      input_schema: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'Sujet ou question, ex. « Le différentiel amont déclenche-t-il ? »' },
          answer: { type: 'string', description: 'Réponse telle qu’établie, ex. « Non ».' },
          source: { type: 'string', enum: ['technicien', 'photo', 'mesure', 'document', 'web'] }
        },
        required: ['question', 'answer']
      }
    },
    run: function (input, ctx) {
      try {
        const f = DM.recordFact(ctx.diag, { question: input.question, answer: input.answer, source: input.source || 'technicien' });
        return ok('Fait mémorisé (' + f.id + ').');
      } catch (e) { return fail(e.message); }
    }
  };

  T.update_equipment = {
    def: {
      name: 'update_equipment',
      description: 'Renseigne le matériel et le contexte d’intervention. N’inscris une marque, un modèle ou une référence ' +
        'QUE s’ils ont été donnés par le technicien ou sont lisibles sur une photo/un document — jamais déduits ni devinés.',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Titre court du diagnostic, ex. « Clim Mitsubishi — C20 déclenche »' },
          installation_type: { type: 'string', enum: DM.INSTALL_TYPES.map(function (t) { return t.id; }) },
          brand: { type: 'string' }, model: { type: 'string' }, reference: { type: 'string' }, serial: { type: 'string' },
          client: { type: 'string' }, site: { type: 'string' }, location: { type: 'string' },
          source: { type: 'string', enum: ['technicien', 'photo', 'document'] }
        }
      }
    },
    run: function (input, ctx) {
      const changed = DM.patchInfo(ctx.diag, {
        name: input.name, installationType: input.installation_type, brand: input.brand, model: input.model,
        reference: input.reference, serial: input.serial, client: input.client, site: input.site, location: input.location
      });
      return ok(changed.length ? 'Matériel mis à jour : ' + changed.join(', ') + '.' : 'Aucun changement.',
        changed.some(function (k) { return ['brand', 'model', 'reference', 'serial'].indexOf(k) !== -1; })
          ? { kind: 'equipment', label: 'Matériel identifié', detail: [ctx.diag.brand, ctx.diag.model, ctx.diag.reference].filter(Boolean).join(' ') }
          : null);
    }
  };

  T.set_fault = {
    def: {
      name: 'set_fault',
      description: 'Enregistre la description de la panne et/ou ajoute des symptômes constatés (faits, pas des hypothèses).',
      input_schema: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          symptoms_add: { type: 'array', items: { type: 'string' } }
        }
      }
    },
    run: function (input, ctx) {
      if (s(input.description)) DM.patchInfo(ctx.diag, { description: input.description });
      const added = list(input.symptoms_add);
      if (added.length) DM.addSymptoms(ctx.diag, added);
      return ok('Panne mise à jour. Symptômes : ' + (DM.symptomList(ctx.diag).join(' ; ') || 'aucun') + '.');
    }
  };

  T.upsert_hypothesis = {
    def: {
      name: 'upsert_hypothesis',
      description: 'Crée (sans id) ou met à jour (avec id) une hypothèse. Statuts : possible, suspectee, ecartee, confirmee. ' +
        '« confirmee » n’est accepté que si un contrôle de cette hypothèse a un résultat ; « ecartee » exige un résultat ou une contre-preuve. ' +
        'Ajoute les preuves (evidence_add) et contre-preuves (counter_evidence_add) en citant des FAITS (mesure, réponse, observation). ' +
        'Aucun pourcentage de probabilité.',
      input_schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          cause: { type: 'string' },
          reason: { type: 'string', description: 'Pourquoi cette cause est envisagée.' },
          status: { type: 'string', enum: HYP_STATUSES },
          evidence_add: { type: 'array', items: { type: 'string' } },
          counter_evidence_add: { type: 'array', items: { type: 'string' } },
          parent_control_id: { type: 'string', description: 'Contrôle dont le résultat a fait naître cette hypothèse.' },
          justification: { type: 'string', description: 'Justification du changement de statut.' }
        }
      }
    },
    run: function (input, ctx) {
      const d = ctx.diag;
      let h;
      try {
        if (input.id) {
          h = DM.findHyp(d, input.id);
          if (!h) return fail('Hypothèse ' + input.id + ' introuvable.');
          if (input.cause || input.reason !== undefined) DM.updateHypothesis(d, h.id, { cause: input.cause || undefined, reason: input.reason });
        } else {
          if (!s(input.cause)) return fail('cause obligatoire pour créer une hypothèse.');
          const dup = d.hypotheses.find(function (x) { return DM.normalize(x.cause) === DM.normalize(input.cause); });
          if (dup) h = dup;
          else h = DM.addHypothesis(d, { cause: input.cause, reason: input.reason, origin: 'agent', parentControlId: input.parent_control_id || null });
        }
        list(input.evidence_add).forEach(function (t) { DM.addEvidence(d, h.id, { text: t, source: 'agent' }); });
        list(input.counter_evidence_add).forEach(function (t) { DM.addEvidence(d, h.id, { text: t, source: 'agent', against: true }); });
        if (input.status && input.status !== h.status) DM.concludeHypothesis(d, h.id, input.status, input.justification || '');
      } catch (e) { return fail(e.message); }
      const S = DM.HYP_STATUS[h.status];
      return ok({ id: h.id, cause: h.cause, status: h.status, evidence: h.evidence.length, counter_evidence: h.counterEvidence.length },
        { kind: 'hypothesis', label: 'Hypothèse ' + S.label.toLowerCase(), detail: h.cause });
    }
  };

  T.propose_control = {
    def: {
      name: 'propose_control',
      description: 'Ajoute le prochain contrôle au plan de contrôle. Privilégie les contrôles simples et sans risque. ' +
        'Explique pourquoi (why). type : hors_tension (consigné), sous_tension (mesure sur installation alimentée), fluide, ' +
        'fonctionnel (essai), visuel. Le niveau de risque est calculé par l’application ; risk_level ne peut que le relever. ' +
        'Ne propose pas un contrôle déjà réalisé.',
      input_schema: {
        type: 'object',
        properties: {
          hypothesis_id: { type: 'string', description: 'Hypothèse que ce contrôle permet de départager (facultatif).' },
          description: { type: 'string', description: 'Ce qu’il faut faire, précisément (point de mesure, appareil).' },
          type: { type: 'string', enum: CONTROL_TYPES },
          expected: { type: 'string', description: 'Résultat attendu. Ne jamais inventer de valeur constructeur : écrire « selon plaque/notice » si inconnue.' },
          why: { type: 'string', description: 'Pourquoi ce contrôle maintenant.' },
          location: { type: 'string', description: 'Emplacement, ex. « bornier unité extérieure ».' },
          risk_level: { type: 'integer', minimum: 1, maximum: 4 }
        },
        required: ['description', 'type', 'why']
      }
    },
    run: function (input, ctx) {
      const d = ctx.diag;
      if (CONTROL_TYPES.indexOf(input.type) === -1) return fail('type invalide.');
      if (input.hypothesis_id && !DM.findHyp(d, input.hypothesis_id)) return fail('Hypothèse ' + input.hypothesis_id + ' introuvable.');
      const same = d.controls.find(function (c) { return overlap(c.description, input.description) >= 0.8; });
      if (same && DM.hasResult(same)) {
        return fail('Contrôle déjà réalisé (' + same.id + ') : « ' + same.obtained + ' » (' + (DM.VERDICTS[same.verdict] || {}).label + '). Ne le refais pas ; exploite ce résultat.');
      }
      if (same) return ok({ id: same.id, note: 'Ce contrôle est déjà prévu ; réutilise-le.', risk: DM.riskLevel(same, d.installationType).level });
      const c = DM.addControl(d, {
        hypothesisId: input.hypothesis_id || null, type: input.type, description: input.description,
        expected: input.expected, why: input.why, location: input.location, risk: input.risk_level, proposedBy: 'agent'
      });
      const r = DM.riskLevel(c, d.installationType);
      ctx.turn.proposedControlId = c.id;
      return ok({ id: c.id, risk_level: r.level, risk_label: r.label, precautions: r.level >= 2 ? r.precautions.slice(0, 4) : [] },
        { kind: 'control', label: 'Contrôle proposé', detail: c.description });
    }
  };

  T.save_measurement = {
    def: {
      name: 'save_measurement',
      description: 'Enregistre une mesure DONNÉE PAR LE TECHNICIEN (dans son dernier message) ou lue sur une photo. ' +
        'Ne jamais inventer ni estimer une valeur. kind : ' + Object.keys(DM.MEASURE_KINDS).join(', ') + '.',
      input_schema: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: Object.keys(DM.MEASURE_KINDS) },
          label: { type: 'string', description: 'Ex. « Intensité absorbée unité extérieure », « Tension L-N ».' },
          value: { type: 'string', description: 'Valeur exactement telle que donnée, ex. « 18,5 ».' },
          unit: { type: 'string' },
          location: { type: 'string' },
          control_id: { type: 'string' },
          result: { type: 'string', enum: ['conforme', 'non_conforme', 'indetermine'] },
          comment: { type: 'string' },
          source: { type: 'string', enum: ['technicien', 'photo'] }
        },
        required: ['kind', 'value']
      }
    },
    run: function (input, ctx) {
      const d = ctx.diag;
      const value = s(input.value);
      // garde-fou : une valeur numérique doit apparaître dans ce que le technicien a écrit (sauf lecture sur photo)
      if (input.source !== 'photo' && /[0-9]/.test(value)) {
        const said = String(ctx.userText || '').replace(/,/g, '.');
        if (said.indexOf(digitsOf(value)) === -1) {
          return fail('Valeur « ' + value + ' » absente du message du technicien : ne jamais inventer une mesure. Demande-la.');
        }
      }
      try {
        const m = DM.addMeasurement(d, {
          kind: input.kind, label: input.label, value: value, unit: input.unit, location: input.location,
          controlId: input.control_id || null, result: input.result || null, comment: input.comment, source: input.source || 'technicien'
        });
        return ok({ id: m.id, recorded: DM.formatMeasurement(m) }, { kind: 'measurement', label: 'Mesure enregistrée', detail: DM.formatMeasurement(m) });
      } catch (e) { return fail(e.message); }
    }
  };

  T.record_control_result = {
    def: {
      name: 'record_control_result',
      description: 'Enregistre le résultat d’un contrôle d’après ce que le technicien a rapporté. verdict : conforme (résultat attendu obtenu), ' +
        'non_conforme (écart), indetermine. Ensuite, mets à jour les hypothèses (preuves / contre-preuves / statut).',
      input_schema: {
        type: 'object',
        properties: {
          control_id: { type: 'string' },
          obtained: { type: 'string', description: 'Ce qui a été constaté ou mesuré, tel que rapporté.' },
          verdict: { type: 'string', enum: ['conforme', 'non_conforme', 'indetermine'] },
          conclusion: { type: 'string' }
        },
        required: ['control_id', 'obtained', 'verdict']
      }
    },
    run: function (input, ctx) {
      const d = ctx.diag;
      const c = DM.findControl(d, input.control_id);
      if (!c) return fail('Contrôle ' + input.control_id + ' introuvable.');
      try {
        // les mesures liées au contrôle restent dans le relevé (save_measurement) : pas de doublon ici
        DM.recordResult(d, c.id, { obtained: input.obtained, verdict: input.verdict, conclusion: input.conclusion }, { declaredInChat: true });
      } catch (e) { return fail(e.message); }
      return ok('Résultat enregistré pour ' + c.id + ' (' + DM.VERDICTS[c.verdict].label + ').',
        { kind: 'result', label: 'Contrôle effectué', detail: c.description + ' → ' + c.obtained });
    }
  };

  T.set_diagnosis_status = {
    def: {
      name: 'set_diagnosis_status',
      description: 'Met à jour le verdict : non_confirme (éléments insuffisants), probable (piste appuyée par des preuves, non confirmée), ' +
        'confirme (hypothèse confirmée par un résultat de contrôle — refusé sinon). Liste précisément ce qui manque (missing).',
      input_schema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['non_confirme', 'probable', 'confirme'] },
          summary: { type: 'string' },
          missing: { type: 'array', items: { type: 'string' }, description: 'Informations manquantes pour conclure.' }
        },
        required: ['status', 'summary']
      }
    },
    run: function (input, ctx) {
      try {
        const v = DM.setVerdict(ctx.diag, { status: input.status, summary: input.summary, missing: input.missing });
        return ok('Verdict : ' + DM.VERDICT_STATUS[v.status].label + '.', { kind: 'verdict', label: DM.VERDICT_STATUS[v.status].label, detail: v.summary });
      } catch (e) { return fail(e.message); }
    }
  };

  T.suggest_report = {
    def: {
      name: 'suggest_report',
      description: 'Signale que le diagnostic est prêt pour le rapport (cause confirmée, réparation décrite ou en attente).',
      input_schema: { type: 'object', properties: { note: { type: 'string' } } }
    },
    run: function (input, ctx) {
      ctx.turn.suggestReport = true;
      return ok('Le bouton « Générer le rapport » sera mis en avant.');
    }
  };

  T.note_photo = {
    def: {
      name: 'note_photo',
      description: 'Enregistre ce que tu observes sur une photo. N’écris que ce qui est suffisamment visible ; ' +
        'signale explicitement ce qui est illisible ou incertain.',
      input_schema: {
        type: 'object',
        properties: {
          photo_id: { type: 'string' },
          observations: { type: 'string', description: 'Références, composants, codes, branchements, défauts visuels, traces de chauffe…' },
          uncertain: { type: 'string', description: 'Ce qui n’est pas lisible ou pas certain.' }
        },
        required: ['photo_id', 'observations']
      }
    },
    run: function (input, ctx) {
      try {
        const text = s(input.observations) + (s(input.uncertain) ? '\nIncertain : ' + s(input.uncertain) : '');
        DM.setPhotoAnalysis(ctx.diag, input.photo_id, text);
        return ok('Analyse enregistrée.', { kind: 'photo', label: 'Photo analysée', detail: s(input.observations).slice(0, 140) });
      } catch (e) { return fail(e.message); }
    }
  };

  T.search_previous_diagnostics = {
    needs: ['knowledge'],
    def: {
      name: 'search_previous_diagnostics',
      description: 'Cherche dans les diagnostics déjà réalisés : mode similaire, reference, code (code défaut), symptome.',
      input_schema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['similaire', 'reference', 'code', 'symptome'] },
          text: { type: 'string' }, reference: { type: 'string' }, error_code: { type: 'string' }, symptom: { type: 'string' }
        },
        required: ['mode']
      }
    },
    run: async function (input, ctx) {
      const entries = await ctx.services.knowledge.entries();
      const res = DM.kb.search(entries, {
        mode: input.mode, text: input.text, reference: input.reference, code: input.error_code, symptom: input.symptom,
        installationType: ctx.diag.installationType, brand: ctx.diag.brand, excludeDiagId: ctx.diag.id, limit: 5
      });
      const label = 'Recherche dans l’historique (' + DM.KB_MODES[input.mode || 'similaire'] + ')';
      if (!res.length) return ok('Aucun diagnostic antérieur correspondant.', { kind: 'knowledge', label: label, detail: 'aucun résultat' });
      return ok(res.map(function (r) { return '- ' + DM.kb.summary(r.entry) + ' [' + r.why.join(', ') + ']'; }).join('\n'),
        { kind: 'knowledge', label: label, detail: DM.plural(res.length, 'résultat') });
    }
  };

  T.search_documentation = {
    needs: ['documents'],
    def: {
      name: 'search_documentation',
      description: 'Cherche dans la base documentaire (notices, schémas, manuels, fiches techniques) par fabricant, catégorie, modèle, référence ou mots-clés.',
      input_schema: {
        type: 'object',
        properties: {
          manufacturer: { type: 'string' }, category: { type: 'string' }, model: { type: 'string' }, reference: { type: 'string' }, query: { type: 'string' }
        }
      }
    },
    run: async function (input, ctx) {
      const docs = await ctx.services.documents.search(input);
      const detail = [input.manufacturer, input.model, input.reference, input.query].filter(Boolean).join(' ');
      if (!docs.length) return ok('Aucun document trouvé.', { kind: 'documentation', label: 'Base documentaire consultée', detail: (detail || 'recherche') + ' — aucun document' });
      return ok(docs.map(function (x) {
        return '- [' + x.id + '] ' + x.title + ' — ' + [x.manufacturer, x.category, x.series, x.model, x.reference].filter(Boolean).join(' › ') + ' (' + x.docType + ')';
      }).join('\n'), { kind: 'documentation', label: 'Base documentaire consultée', detail: DM.plural(docs.length, 'document') + ' trouvé' + (docs.length > 1 ? 's' : '') });
    }
  };

  T.read_document = {
    needs: ['documents'],
    def: {
      name: 'read_document',
      description: 'Ouvre un document de la base documentaire (PDF ou image) pour le lire. Cite la page ou la section utilisée.',
      input_schema: {
        type: 'object',
        properties: { document_id: { type: 'string' }, focus: { type: 'string', description: 'Ce que tu cherches dans le document.' } },
        required: ['document_id']
      }
    },
    run: async function (input, ctx) {
      const doc = await ctx.services.documents.read(input.document_id);
      if (!doc) return fail('Document ' + input.document_id + ' introuvable.');
      if (!ctx.diag.documents.some(function (x) { return x.id === doc.meta.id; })) {
        ctx.diag.documents.push({ id: doc.meta.id, title: doc.meta.title, at: new Date().toISOString() });
      }
      ctx.turn.attachments.push(doc.block);
      return ok('Document « ' + doc.meta.title + ' » joint ci-après. Cherche : ' + (s(input.focus) || 'informations utiles au diagnostic') + '.',
        { kind: 'documentation', label: 'Documentation consultée', detail: doc.meta.title });
    }
  };

  T.analyze_image = {
    needs: ['images'],
    def: {
      name: 'analyze_image',
      description: 'Réaffiche une photo déjà envoyée (par son id) pour l’examiner ; enregistre ensuite tes observations avec note_photo.',
      input_schema: {
        type: 'object',
        properties: { photo_id: { type: 'string' }, focus: { type: 'string' } },
        required: ['photo_id']
      }
    },
    run: async function (input, ctx) {
      const img = await ctx.services.images.get(ctx.diag.id, input.photo_id);
      if (!img) return fail('Photo ' + input.photo_id + ' indisponible sur le serveur (demande au technicien de la renvoyer).');
      return {
        content: [
          { type: 'text', text: 'Photo ' + input.photo_id + (s(input.focus) ? ' — à examiner : ' + s(input.focus) : '') },
          { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } }
        ],
        trace: { kind: 'photo', label: 'Photo analysée', detail: input.photo_id }
      };
    }
  };

  DM.agent.TOOLS = T;

  /** Outils disponibles selon les services fournis. */
  DM.agent.availableTools = function (services) {
    services = services || {};
    return Object.keys(T).filter(function (name) {
      return (T[name].needs || []).every(function (n) { return !!services[n]; });
    });
  };

  DM.agent.toolDefs = function (names) {
    return names.map(function (n) { return T[n].def; });
  };

  /** Exécute un appel d'outil ; les exceptions deviennent des résultats d'erreur (l'agent peut se corriger). */
  DM.agent.runTool = async function (name, input, ctx) {
    const tool = T[name];
    if (!tool) return fail('Outil inconnu : ' + name);
    if (!input || typeof input !== 'object') return fail('Entrée invalide.');
    const schema = tool.def.input_schema;
    const missing = (schema.required || []).filter(function (k) { return input[k] === undefined || input[k] === null || input[k] === ''; });
    if (missing.length) return fail('Champs obligatoires manquants : ' + missing.join(', '));
    try { return await tool.run(input, ctx); }
    catch (e) { return fail('Erreur outil ' + name + ' : ' + (e && e.message ? e.message : String(e))); }
  };
})(window.DM);
