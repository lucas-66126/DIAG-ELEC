'use strict';
/* Banque de cas — automatisme, automates, capteurs et actionneurs. */
module.exports = function (cas) {
  return [
    cas('aut-01', 'automatisme', 'Cycle qui se bloque de temps en temps (capteur déréglé)',
      'Machine de conditionnement pilotée par automate : le cycle se bloque de temps en temps à l’étape de transfert, il faut pousser la pièce à la main pour que ça reparte. Pas de défaut affiché.',
      { faits: [[/code defaut/, 'Non']],
        controles: [
          [/etape active/, 'Étape 14 active : l’automate attend le capteur B7 « pièce en position », non conforme'],
          [/presenter la piece/, 'Capteur inductif B7 desserré, trop loin de la pièce : détection aléatoire']],
        attendu: /capteur deregle/ }),

    cas('aut-02', 'automatisme', 'Arrêts intermittents pendant les déplacements (câble en chaîne porte-câbles)',
      'Portique de manutention avec automate : arrêt intermittent du cycle pendant les déplacements de l’axe X, le défaut « fin de course non vu » apparaît puis disparaît. ' +
      'Le capteur a déjà été remplacé deux fois.',
      { validation: true,
        faits: [[/code defaut/, 'Non']],
        controles: [
          [/etape active/, 'L’automate attend l’entrée I3.2, capteur de position de l’axe X : non conforme'],
          [/presenter la piece/, 'Le capteur détecte bien, sa LED s’allume à chaque passage, conforme', 'c'],
          [/borne d.entree de l.automate/, 'Capteur actionné, LED du capteur allumée : la tension est absente par moments à la borne d’entrée quand l’axe bouge'],
          [/continuite de chaque fil/, 'Fil du signal coupé dans la chaîne porte-câbles : la continuité disparaît quand on plie le câble']],
        attendu: /liaison capteur/ }),

    cas('aut-03', 'automatisme', 'Automate qui redémarre seul (alimentation 24 V surchargée)',
      'Ligne d’assemblage : l’automate redémarre tout seul plusieurs fois par jour, l’écran du pupitre clignote au même moment et plusieurs capteurs passent en défaut. ' +
      'C’est apparu après l’ajout d’un poste avec six électrovannes.',
      { faits: [[/code defaut/, 'Non']],
        controles: [
          [/en sortie d.alimentation/, '24,1 V à vide, elle chute à 19,4 V quand les électrovannes du nouveau poste sont commandées'],
          [/courant debite/, '11,8 A débités pour une alimentation de 10 A : non conforme']],
        attendu: /alimentation 24 v/ }),

    cas('aut-04', 'automatisme', 'Vérin qui ne sort plus, sortie active (bobine d’électrovanne)',
      'Poste de bridage piloté par automate : le vérin de serrage ne sort plus. La LED de la sortie automate s’allume bien à la commande. La pression d’air est bonne et les autres vérins fonctionnent.',
      { faits: [[/code defaut/, 'Non']],
        controles: [
          [/etape active/, 'L’automate attend le capteur « vérin sorti » : le vérin ne bouge pas, non conforme'],
          [/borne de sortie de l.automate/, '24 V à la borne de sortie et 24 V aux bornes de l’électrovanne, conforme', 'c'],
          [/resistance de la bobine/, 'Bobine de l’électrovanne : résistance infinie, bobine coupée']],
        attendu: /actionneur ou bobine/ }),

    cas('aut-05', 'automatisme', 'Perte intermittente d’une station déportée (connecteur réseau)',
      'Ligne de convoyage : l’automate signale par moments la perte de la station d’entrées/sorties déportées n°4 en Profinet, tout le tronçon s’arrête puis repart. ' +
      'Depuis le déplacement d’une armoire le mois dernier.',
      { validation: true,
        faits: [[/code defaut/, 'Non']],
        controles: [
          [/led de diagnostic reseau/, 'Diagnostic : la station 4 décroche plusieurs fois par jour, LED BF qui clignote, non conforme'],
          [/connecteurs du participant absent/, 'Connecteur RJ45 de la station 4 mal serti, câble plié à angle vif à l’entrée de l’armoire : non conforme']],
        attendu: /communication reseau/ }),

    cas('aut-06', 'automatisme', 'Niveau affiché à 0 % en permanence (boucle 4-20 mA coupée)',
      'Station de traitement d’eau : la mesure de niveau de la bâche affiche 0 % en permanence sur la supervision alors que la bâche est à moitié pleine ; le remplissage ne s’arrête plus. ' +
      'Capteur de niveau 4-20 mA raccordé sur l’automate.',
      { faits: [[/code defaut/, 'Non']],
        controles: [
          [/courant de la boucle/, '0 mA dans la boucle : non conforme'],
          [/aux bornes du transmetteur/, 'Aucune tension aux bornes du transmetteur : fil coupé dans la boîte de jonction en haut de bâche, borne oxydée']],
        attendu: /signal analogique/ }),

    cas('aut-07', 'automatisme', 'Vanne qui ne s’ouvre plus, LED de sortie allumée (sortie détruite)',
      'Machine de remplissage pilotée par automate : la vanne de dosage ne s’ouvre plus. À la commande, la LED de la sortie Q2.3 s’allume sur la carte mais rien ne se passe. ' +
      'La vanne s’ouvre si on l’alimente directement en essai.',
      { faits: [[/code defaut/, 'Non']],
        controles: [
          [/borne de sortie de l.automate/, 'LED allumée mais aucune tension à la borne de sortie Q2.3'],
          [/fusible de la carte de sorties/, 'Fusible, commun et fil corrects', 'c']],
        attendu: /sortie automate/ })
  ];
};
