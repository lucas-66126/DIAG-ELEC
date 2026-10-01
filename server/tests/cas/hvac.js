'use strict';
/* Banque de cas — climatisation, pompes à chaleur, froid, ventilation, chauffage. */
module.exports = function (cas) {
  return [
    cas('hvac-01', 'hvac', 'Split qui refroidit de moins en moins (manque de fluide)',
      'Split mural d’une salle serveur : il tourne en continu mais refroidit de moins en moins bien depuis un mois. Givre sur le premier tiers de l’évaporateur seulement. ' +
      'Les filtres ont été nettoyés la semaine dernière.',
      { faits: [[/code defaut/, 'Non']],
        controles: [
          [/pressions hp\/bp/, 'BP à 4,2 bar, surchauffe de 19 K, sous-refroidissement de 1 K : non conforme'],
          [/rechercher une fuite/, 'Traces d’huile et fuite détectée au dudgeon de la liaison, côté unité intérieure'],
          [/etat des filtres/, 'Filtres propres', 'c']],
        attendu: /manque de fluide/ }),

    cas('hvac-02', 'hvac', 'Cassette qui goutte sur les bureaux (pompe de relevage)',
      'Cassette de climatisation dans un faux plafond de bureau, avec pompe de relevage des condensats : de l’eau goutte de l’appareil sur les postes de travail quand elle fonctionne en froid depuis plusieurs heures. ' +
      'Elle refroidit bien.',
      { faits: [[/code defaut/, 'Non']],
        controles: [
          [/bac de la pompe de relevage/, 'Eau versée dans le bac : la pompe ne démarre pas, son flotteur est collé par les dépôts'],
          [/pente de l.evacuation/, 'Tube d’évacuation libre, pente correcte', 'c']],
        attendu: /pompe de relevage des condensats/ }),

    cas('hvac-03', 'hvac', 'Groupe froid en sécurité haute pression l’après-midi (condenseur)',
      'Groupe d’eau glacée en toiture : il se met en sécurité haute pression les après-midi de forte chaleur depuis début juin, réarmement manuel nécessaire. Le matin il fonctionne. ' +
      'Des peupliers bordent le bâtiment.',
      { validation: true,
        faits: [[/code defaut est-il/, 'Oui'], [/quel code/, 'HP, sécurité haute pression']],
        controles: [
          [/temperature de condensation/, 'Condensation à 58 °C pour 31 °C extérieur, soit 27 K d’écart : non conforme'],
          [/batterie du condenseur/, 'Batterie colmatée par les pollens de peuplier sur toute sa surface']],
        attendu: /condenseur encrasse/ }),

    cas('hvac-04', 'hvac', 'Compresseur qui bourdonne puis coupe (condensateur)',
      'Unité extérieure d’un split : le ventilateur tourne mais le compresseur bourdonne quelques secondes puis coupe, et recommence toutes les trois minutes. Pas de froid.',
      { faits: [[/code defaut/, 'Non']],
        controles: [
          [/capacite du condensateur/, 'Condensateur du compresseur marqué 35 µF, mesuré à 9 µF : hors tolérance, boîtier gonflé']],
        attendu: /condensateur de demarrage/ }),

    cas('hvac-05', 'hvac', 'Gainable qui s’arrête avec un code sonde',
      'Climatiseur gainable : il s’arrête au bout de quelques minutes en affichant le code E4, défaut de sonde de batterie intérieure d’après la notice. ' +
      'Après coupure de l’alimentation il redémarre, puis recommence.',
      { controles: [
          [/deconnecter la sonde/, 'Sonde de batterie intérieure : circuit ouvert, résistance infinie']],
        attendu: /defaut de sonde/ }),

    cas('hvac-06', 'hvac', 'CTA sans soufflage, moteur qui tourne (courroie)',
      'CTA de bureaux : défaut débit d’air au tableau, plus de soufflage dans les bureaux alors que le moteur du ventilateur de soufflage tourne. Un sifflement avait été entendu la semaine dernière.',
      { validation: true,
        faits: [[/code defaut/, 'Non']],
        controles: [
          [/controler la courroie/, 'Courroie cassée, retrouvée au fond du caisson']],
        attendu: /courroie de ventilateur/ }),

    cas('hvac-07', 'hvac', 'Pompe à chaleur prise dans la glace (dégivrage)',
      'Pompe à chaleur air/eau en plein hiver : l’unité extérieure est prise dans un bloc de glace, la maison ne chauffe plus et l’appoint électrique tourne en permanence. ' +
      'La charge de fluide a été vérifiée le mois dernier, elle est correcte.',
      { faits: [[/code defaut/, 'Non']],
        controles: [
          [/cycle de degivrage/, 'Aucun dégivrage ne se lance, même batterie entièrement givrée : non conforme'],
          [/sonde de degivrage/, 'Sonde de batterie extérieure hors tolérance : 2 kΩ mesurés, très loin de la table du constructeur']],
        attendu: /defaut de degivrage/ }),

    cas('hvac-08', 'hvac', 'Chaudière : appoints d’eau répétés, soupape qui goutte (vase d’expansion)',
      'Chaudière gaz d’un petit collectif : il faut rajouter de l’eau toutes les semaines, la pression monte à presque 3 bar quand ça chauffe et la soupape goutte, puis retombe à 0,5 bar à froid. ' +
      'Aucune fuite visible sur le réseau.',
      { faits: [[/code defaut/, 'Non']],
        controles: [
          [/pression du circuit a froid puis a chaud/, '0,6 bar à froid, 2,9 bar à chaud : non conforme'],
          [/pression de gonflage/, 'Vase isolé : 0 bar à la valve, et de l’eau sort']],
        attendu: /vase d.expansion/ }),

    cas('hvac-09', 'hvac', 'Brûleur fioul qui se met en sécurité',
      'Chaudière fioul : le brûleur démarre, on entend la préventilation, puis il se met en sécurité (voyant rouge) au bout d’une dizaine de secondes. Après réarmement, pareil. La cuve est pleine.',
      { validation: true,
        faits: [[/code defaut/, 'Non']],
        controles: [
          [/observer la sequence/, 'Préventilation, étincelle, la flamme apparaît puis mise en sécurité à la fin du temps de sécurité : la flamme n’est pas détectée, non conforme'],
          [/electrodes/, 'Cellule de détection de flamme encrassée par la suie']],
        attendu: /bruleur en securite/ }),

    cas('hvac-10', 'hvac', 'Chambre froide négative qui remonte en température (dégivrage)',
      'Chambre froide négative d’un restaurant : la température remonte à -8 °C au lieu de -18 °C, l’évaporateur est pris dans un bloc de glace. Le groupe tourne sans arrêt. Porte et joint en bon état.',
      { faits: [[/code defaut/, 'Non']],
        controles: [
          [/degivrage manuel/, 'Dégivrage lancé : 0 A sur les résistances, elles ne chauffent pas, non conforme'],
          [/chaque resistance de degivrage/, 'Deux résistances sur trois coupées, résistance infinie']],
        attendu: /degivrage de l.evaporateur/ })
  ];
};
