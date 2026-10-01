'use strict';
/* Banque de cas — sécurité incendie. */
module.exports = function (cas) {
  return [
    cas('inc-01', 'incendie', 'Alarmes intempestives tous les matins dans un studio (vapeur)',
      'Résidence étudiante, SSI avec détecteurs optiques dans les studios : alarmes feu intempestives presque tous les matins entre 7 h et 8 h, sur le même studio. ' +
      'Le détecteur a été remplacé par un neuf il y a quinze jours, sans changement.',
      { faits: [[/code defaut/, 'Non']],
        controles: [
          [/heures des alarmes/, 'Toutes les alarmes entre 7 h et 8 h, au moment des douches : non conforme'],
          [/environnement du detecteur/, 'Détecteur placé juste devant la porte de la salle d’eau : la vapeur l’atteint directement, non conforme'],
          [/niveau d.encrassement/, 'Toujours le studio 214, mais niveau d’encrassement normal : le détecteur est neuf', 'c']],
        attendu: /detecteur inadapte/ }),

    cas('inc-02', 'incendie', 'Défaut source secondaire permanent (batteries)',
      'ECS d’un collège : défaut « source secondaire » affiché en permanence depuis une semaine, voyant jaune alimentation. Le secteur est présent. La dernière maintenance remonte à cinq ans.',
      { faits: [[/code defaut/, 'Non']],
        controles: [
          [/tension secteur a l.arrivee/, 'Secteur 231 V, charge à 27,2 V, conforme', 'c'],
          [/date des batteries/, 'Batteries de 2018 ; secteur coupé, la tension tombe à 19 V en moins d’une minute']],
        attendu: /alimentation \/ batteries/ }),

    cas('inc-03', 'incendie', 'Dérangement de zone après le passage du peintre',
      'Centrale incendie conventionnelle d’un petit hôtel : dérangement permanent sur la zone 3 (étage 2) depuis le passage du peintre. Pas d’alarme. Les autres zones sont normales.',
      { validation: true,
        faits: [[/code defaut/, 'Non']],
        controles: [
          [/element de fin de ligne/, 'Zone 3 : résistance infinie, ligne ouverte'],
          [/socle par socle/, 'Détecteur de la chambre 207 retiré de son socle et posé sur l’armoire']],
        attendu: /ligne de detection/ }),

    cas('inc-04', 'incendie', 'Défaut de position d’un clapet coupe-feu',
      'CMSI d’un ERP : défaut de position permanent sur le clapet coupe-feu CCF12 du local technique. Sur place le clapet est bien ouvert, en position d’attente. ' +
      'Apparu après le remplacement d’une gaine de ventilation.',
      { faits: [[/code defaut/, 'Non']],
        controles: [
          [/position reelle a la position signalee/, 'Le clapet est ouvert mais le CMSI le voit hors position d’attente : non conforme'],
          [/contacts de debut et de fin de course/, 'Contact de position d’attente : fil arraché au bornier du clapet']],
        attendu: /contact de position de das/ }),

    cas('inc-05', 'incendie', 'Bloc de secours qui ne s’allume pas',
      'Bloc de secours au-dessus d’une issue : son voyant est orange et il ne s’allume pas quand on coupe l’éclairage du couloir. Les autres blocs du couloir fonctionnent. Bloc de 2015.',
      { faits: [[/code defaut/, 'Non']],
        controles: [
          [/couper l.alimentation du bloc/, 'À la coupure, le bloc ne s’allume pas du tout'],
          [/presence du secteur aux bornes du bloc/, '230 V présents, le bloc est bien alimenté, conforme', 'c']],
        attendu: /bloc autonome/ }),

    cas('inc-06', 'incendie', 'ECS qui reste en alarme feu, impossible à réarmer',
      'École : l’alarme incendie s’est déclenchée ce matin et l’ECS reste en alarme feu, impossible de réarmer. Aucune fumée nulle part. Des élèves jouaient dans le couloir du préau.',
      { validation: true,
        faits: [[/code defaut/, 'Non']],
        controles: [
          [/declencheur manuel/, 'Déclencheur manuel du préau enfoncé, membrane déformée']],
        attendu: /declencheur manuel/ }),

    cas('inc-07', 'incendie', 'Défaut terre depuis les fortes pluies',
      'ECS conventionnelle d’un parking souterrain : défaut terre permanent depuis les fortes pluies de la semaine dernière. Pas d’alarme, pas de dérangement de zone.',
      { faits: [[/code defaut/, 'Non']],
        controles: [
          [/isolement de chaque ligne/, 'Ligne du niveau -2 : 0,04 MΩ à la terre ; les autres lignes > 50 MΩ'],
          [/socles et boites/, 'Boîte de dérivation du niveau -2 sous une infiltration, pleine d’eau']],
        attendu: /defaut d.isolement de ligne/ }),

    cas('inc-08', 'incendie', 'Porte coupe-feu qui ne reste plus ouverte',
      'Porte coupe-feu à deux vantaux d’un couloir d’hôpital, asservie au SSI : elle ne reste plus ouverte, le personnel la cale avec une chaise. Les autres portes de l’étage tiennent.',
      { faits: [[/code defaut/, 'Non']],
        controles: [
          [/ventouse de porte/, 'Aucune tension aux bornes de la ventouse : fil sectionné dans la goulotte'],
          [/observer sa fermeture complete/, 'La porte se ferme complètement et se verrouille seule, conforme', 'c']],
        attendu: /porte coupe-feu/ })
  ];
};
