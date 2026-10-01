'use strict';
/**
 * Banc d'essai du moteur local : rejoue une banque de cas de panne comme le ferait un technicien.
 *
 * Règles du jeu (les mêmes que pour les cas donnés à la main) :
 *  - le technicien décrit la panne, avec ses fausses pistes ;
 *  - une mesure ou un constat n'est donné QUE si l'application le demande ;
 *  - pour tout contrôle que le cas ne prévoit pas, le technicien répond « rien d'anormal » (le reste de l'installation est sain) ;
 *  - à une question dont il n'a pas la réponse, il répond « je ne sais pas » ;
 *  - quand l'application propose de confirmer, il confirme : une confirmation sur la mauvaise cause compte donc comme un échec.
 *
 * Un cas est réussi si le diagnostic est confirmé sur la cause attendue, en MAX_TURNS échanges au plus.
 *
 * Lancer :  npm run cas            (tableau complet)
 *           npm run cas -- pompe   (un domaine ou un identifiant)
 */
const DM = require('../../src/core');

const MAX_TURNS = 16;
const NORMAL = 'Rien d’anormal, conforme.';

function cas(id, domaine, titre, description, o) {
  return Object.assign({ id: id, domaine: domaine, titre: titre, description: description, faits: [], controles: [], validation: false }, o);
}

function findAnswer(list, text) {
  const n = DM.normalize(text);
  for (const entry of list) if (entry[0].test(n)) return entry;
  return null;
}

async function jouer(c) {
  let d = DM.createDraft({});
  let msg = c.description;
  let lastVerdict = 'Conforme';
  const journal = [];
  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    DM.addMessage(d, { role: 'user', text: msg });
    let out;
    try { out = await DM.agent.runLocalTurn({ diag: d, services: { knowledge: { entries: async function () { return []; } } } }); }
    catch (e) { return { ok: false, tours: turn, raison: 'erreur : ' + e.message, journal: journal, diag: d }; }
    d = out.diag;
    journal.push({ technicien: msg, application: out.reply });
    if (d.verdict.status === 'confirme') {
      const ok = c.attendu.test(DM.normalize(d.verdict.summary));
      return { ok: ok, tours: turn, confirme: d.verdict.summary, raison: ok ? '' : 'mauvaise cause confirmée', journal: journal, diag: d };
    }
    const ask = out.ask;
    if (!ask) return { ok: false, tours: turn, raison: 'l’application ne demande plus rien', journal: journal, diag: d };
    if (ask.kind === 'confirm') msg = 'Oui, confirmer';
    else if (ask.kind === 'verdict') msg = lastVerdict;
    else if (ask.kind === 'result' && ask.controlId) {
      const ctl = DM.findControl(d, ask.controlId);
      const hit = findAnswer(c.controles, ctl.description);
      msg = hit ? hit[1] : NORMAL;
      lastVerdict = hit && hit[2] !== 'c' ? 'Non conforme' : 'Conforme';
    } else {
      const hit = findAnswer(c.faits, ask.question);
      msg = hit ? hit[1] : 'Je ne sais pas';
    }
  }
  return { ok: false, tours: MAX_TURNS, raison: 'pas de diagnostic confirmé en ' + MAX_TURNS + ' échanges', journal: journal, diag: d };
}

function charger() {
  return ['electricite', 'electrotechnique', 'moteur', 'pompe', 'hvac', 'automatisme', 'acces', 'incendie', 'industriel', 'terrain', 'aveugle', 'aveugle2', 'aveugle3']
    .reduce(function (all, f) { return all.concat(require('./' + f)(cas)); }, []);
}

async function jouerTout(filtre) {
  const tous = charger().filter(function (c) { return !filtre || c.domaine === filtre || c.id === filtre; });
  const resultats = [];
  for (const c of tous) resultats.push(Object.assign({ cas: c }, await jouer(c)));
  return resultats;
}

function bilan(resultats) {
  const part = function (list) {
    const ok = list.filter(function (r) { return r.ok; }).length;
    return { total: list.length, reussis: ok, taux: list.length ? Math.round(ok / list.length * 100) : 0 };
  };
  const tours = resultats.filter(function (r) { return r.ok; }).map(function (r) { return r.tours; }).sort(function (a, b) { return a - b; });
  return {
    tous: part(resultats),
    mise_au_point: part(resultats.filter(function (r) { return !r.cas.validation && !r.cas.terrain && !r.cas.aveugle && !r.cas.aveugle2 && !r.cas.aveugle3; })),
    aveugle3: part(resultats.filter(function (r) { return r.cas.aveugle3; })),
    aveugle2: part(resultats.filter(function (r) { return r.cas.aveugle2; })),
    aveugle: part(resultats.filter(function (r) { return r.cas.aveugle; })),
    terrain: part(resultats.filter(function (r) { return r.cas.terrain; })),
    validation: part(resultats.filter(function (r) { return r.cas.validation; })),
    toursMedian: tours.length ? tours[Math.floor(tours.length / 2)] : 0
  };
}

module.exports = { cas: cas, jouer: jouer, charger: charger, jouerTout: jouerTout, bilan: bilan, MAX_TURNS: MAX_TURNS };

if (require.main === module) {
  const args = process.argv.slice(2);
  const detail = args.indexOf('--detail') !== -1;
  const filtre = args.filter(function (a) { return a.indexOf('--') !== 0; })[0];
  jouerTout(filtre).then(function (resultats) {
    // les cas de validation ne sont détaillés que sur demande (--validation) : on ne met pas le moteur au point dessus
    const montrerValidation = args.indexOf('--validation') !== -1;
    resultats.forEach(function (r) {
      const c = r.cas;
      if (c.validation && !montrerValidation) return;
      console.log((r.ok ? 'OK   ' : 'ÉCHEC') + ' ' + c.id.padEnd(9) + (c.validation ? 'V ' : '  ') + String(r.tours).padStart(2) + ' éch.  ' + c.titre +
        (r.ok ? '' : '\n        → ' + r.raison + (r.confirme ? ' : « ' + r.confirme + ' »' : '')));
      if (!r.ok || detail) {
        console.log('        pistes : ' + r.diag.hypotheses.map(function (h) { return h.cause + ' [' + h.status + ']'; }).join(' | '));
        if (detail) r.journal.forEach(function (j) { console.log('        T> ' + j.technicien + '\n        A> ' + String(j.application).replace(/\n/g, '\n           ')); });
      }
    });
    const b = bilan(resultats);
    console.log('\nMise au point : ' + b.mise_au_point.reussis + '/' + b.mise_au_point.total + ' (' + b.mise_au_point.taux + ' %)' +
      '   Validation : ' + b.validation.reussis + '/' + b.validation.total + ' (' + b.validation.taux + ' %)' +
      '   Terrain : ' + b.terrain.reussis + '/' + b.terrain.total + ' (' + b.terrain.taux + ' %)' +
      '   Aveugle : ' + b.aveugle.reussis + '/' + b.aveugle.total + ' (' + b.aveugle.taux + ' %)' +
      '   Aveugle 2 : ' + b.aveugle2.reussis + '/' + b.aveugle2.total + ' (' + b.aveugle2.taux + ' %)' +
      '   Aveugle 3 : ' + b.aveugle3.reussis + '/' + b.aveugle3.total + ' (' + b.aveugle3.taux + ' %)' +
      '   Ensemble : ' + b.tous.reussis + '/' + b.tous.total + ' (' + b.tous.taux + ' %)   Médiane : ' + b.toursMedian + ' échanges');
  });
}
