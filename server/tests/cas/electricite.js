'use strict';
/* Banque de cas — électricité / distribution.
 * faits : [question (regex), réponse] · controles : [contrôle demandé (regex), réponse, 'c' si le résultat est conforme]
 * Les expressions sont comparées au texte en minuscules sans accents. validation: true = cas tenu à l'écart de la mise au point. */
module.exports = function (cas) {
  return [
    cas('elec-01', 'electricite', 'Différentiel qui saute par temps de pluie (prise extérieure)',
      'Tableau divisionnaire d’un atelier : l’interrupteur différentiel 30 mA des prises saute plusieurs fois par semaine, surtout quand il pleut. ' +
      'On réarme et ça tient quelques heures. Le disjoncteur des prises ne bouge pas. Un compresseur a été ajouté le mois dernier.',
      { faits: [[/combien de temps/, 'De façon aléatoire, plutôt par temps de pluie']],
        controles: [
          [/circuits un par un/, 'Le différentiel retombe dès que je referme le circuit des prises extérieures du quai, les autres circuits tiennent'],
          [/isolement/, 'Circuit des prises extérieures, récepteurs débranchés : 0,08 MΩ entre phase et terre'],
          [/inspecter les points exposes/, 'Prise extérieure du quai : capot cassé, eau dans le boîtier, bornes oxydées']],
        attendu: /^defaut d.isolement/ }),

    cas('elec-02', 'electricite', 'Disjoncteur de prises qui déclenche en fin de matinée (surcharge)',
      'Bureaux : le disjoncteur C16 du circuit prises de l’open space déclenche en fin de matinée depuis qu’il fait froid, après une à deux heures. ' +
      'Le différentiel ne déclenche pas. Ce disjoncteur a été remplacé il y a six mois.',
      { faits: [[/combien de temps/, 'Après une à deux heures de fonctionnement']],
        controles: [
          [/courant absorbe/, '19,5 A mesurés sur le circuit en fin de matinée'],
          [/recenser les recepteurs/, 'Trois radiateurs d’appoint de 1500 W ont été ajoutés sur ce circuit, en plus des postes informatiques : puissance trop élevée pour un 16 A']],
        attendu: /surcharge du circuit/ }),

    cas('elec-03', 'electricite', 'Déclenchement immédiat après des travaux (court-circuit)',
      'Depuis la pose d’étagères hier dans la réserve, le disjoncteur de l’éclairage de la réserve déclenche immédiatement dès qu’on le réarme, même interrupteur ouvert. ' +
      'Les luminaires ont deux ans.',
      { validation: true,
        faits: [[/differentiel/, 'Non']],
        controles: [
          [/resistance entre phase et neutre/, 'Luminaires débranchés : 0,3 Ω entre phase et neutre'],
          [/parcours du cable/, 'Une vis de fixation de l’étagère a traversé la gaine encastrée, conducteurs écrasés et noircis']],
        attendu: /court.circuit/ }),

    cas('elec-04', 'electricite', 'Odeur de chaud au tableau, éclairage qui vacille (connexion desserrée)',
      'Tableau général d’un commerce : odeur de chaud près du tableau, l’éclairage de la surface de vente vacille quand le four de la boulangerie démarre, parfois une coupure brève. ' +
      'Aucune protection ne déclenche.',
      { controles: [
          [/thermographie/, 'Borne aval du disjoncteur du four à 96 °C, les autres bornes à environ 35 °C'],
          [/serrage au couple/, 'Borne desserrée, isolant du conducteur noirci et durci sur 3 cm']],
        attendu: /connexion desserree/ }),

    cas('elec-05', 'electricite', 'Appareils grillés, éclairage trop fort ou trop faible (neutre)',
      'Atelier alimenté en triphasé avec neutre : depuis ce matin plusieurs appareils monophasés ont grillé (deux écrans, un chargeur), certaines lampes éclairent très fort et d’autres faiblement, ' +
      'et ça change quand on met des machines en route. Aucun disjoncteur n’a déclenché. Un orage est passé cette nuit.',
      { controles: [
          [/entre chaque phase et le neutre/, 'L1-N : 168 V · L2-N : 291 V · L3-N : 236 V, et ça varie quand on démarre une machine'],
          [/serrage du neutre/, 'Borne de neutre du répartiteur desserrée et noircie']],
        attendu: /neutre/ }),

    cas('elec-06', 'electricite', 'Différentiel qui déclenche sans raison sur un plateau informatique',
      'Plateau de bureaux, 24 postes informatiques sur un même interrupteur différentiel 30 mA : il déclenche sans raison apparente une à deux fois par semaine, souvent le matin à l’allumage des postes. ' +
      'Aucun appareil particulier en cause, pas d’humidité, locaux récents.',
      { validation: true,
        faits: [[/combien de temps/, 'De façon aléatoire, souvent le matin']],
        controles: [
          [/circuits un par un/, 'Aucun circuit ne fait déclencher seul, le différentiel tient à chaque fois', 'c'],
          [/courant de fuite/, '21 mA de fuite permanente mesurés sur le départ, tous les postes allumés'],
          [/tester le differentiel/, 'Déclenche à 23 mA en 28 ms : conforme', 'c']],
        attendu: /cumul de courants de fuite/ }),

    cas('elec-07', 'electricite', 'Pompe en bout de ligne qui démarre mal (chute de tension)',
      'Pompe d’arrosage au fond du terrain, alimentée par un câble de 180 m depuis le tableau : elle démarre mal, peine, et son disjoncteur moteur finit par déclencher. ' +
      'Elle a été remplacée par une plus puissante au printemps. Au tableau tout semble normal.',
      { faits: [[/combien de temps/, 'Après quelques minutes'], [/differentiel/, 'Non']],
        controles: [
          [/tension au depart/, 'Au tableau 398 V ; aux bornes de la pompe en marche 351 V'],
          [/section du cable/, 'Câble de 2,5 mm² sur 180 m pour 11 A absorbés : section insuffisante']],
        attendu: /chute de tension/ }),

    cas('elec-08', 'electricite', 'Différentiel qui déclenche quand le lave-vaisselle chauffe',
      'Cuisine d’un restaurant : le différentiel 30 mA de la cuisine déclenche dès que le lave-vaisselle se met en chauffe, pas au remplissage. Le reste de la cuisine fonctionne. ' +
      'Le sol est lavé à grande eau tous les soirs.',
      { faits: [[/combien de temps/, 'Après quelques minutes, à la mise en chauffe']],
        controles: [
          [/un par un/, 'C’est le lave-vaisselle qui fait déclencher ; lave-vaisselle débranché, tout tient'],
          [/recepteurs debranches/, 'Circuit du lave-vaisselle, appareil débranché : > 200 MΩ', 'c'],
          [/appareil identifie/, 'Lave-vaisselle seul : 0,05 MΩ entre la résistance de chauffe et la masse']],
        attendu: /recepteur defectueux/ }),

    cas('elec-09', 'electricite', 'Moitié du parking sans éclairage (fusible)',
      'Armoire d’éclairage du parking : plus aucun éclairage sur la moitié du parking depuis hier soir. Les disjoncteurs sont tous enclenchés. ' +
      'L’horloge a été reprogrammée la semaine dernière.',
      { validation: true,
        controles: [
          [/amont et en aval/, 'Sectionneur à fusibles général : 400 V en amont sur les trois phases ; en aval, plus de tension sur L2, fusible fondu']],
        attendu: /absence de tension en amont/ })
  ];
};
