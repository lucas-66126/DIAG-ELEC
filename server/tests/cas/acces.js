'use strict';
/* Banque de cas — contrôle d'accès, portails. */
module.exports = function (cas) {
  return [
    cas('acc-01', 'acces', 'Porte qui s’ouvre en tirant fort (ventouse sous-alimentée)',
      'Porte d’entrée d’un immeuble de bureaux avec ventouse 300 kg : on arrive à l’ouvrir en tirant fort alors qu’elle est verrouillée. Le lecteur et les badges fonctionnent normalement. ' +
      'Une deuxième ventouse a été ajoutée sur la même alimentation il y a un mois.',
      { faits: [[/code defaut/, 'Non']],
        controles: [
          [/tension aux bornes de la ventouse/, '8,9 V aux bornes de la ventouse, porte verrouillée : trop faible pour une ventouse 12 V'],
          [/contre-plaque/, 'Contre-plaque propre, bien plaquée et articulée', 'c']],
        attendu: /ventouse electromagnetique/ }),

    cas('acc-02', 'acces', 'Badge refusé seulement le samedi (droits)',
      'Contrôle d’accès d’un site : le badge d’un nouvel intérimaire est refusé à la porte du magasin, uniquement le samedi. Les autres jours il passe, et les autres badges passent le samedi.',
      { faits: [[/code defaut/, 'Non']],
        controles: [
          [/motif du refus/, 'Journal : « hors plage horaire » ; son profil n’autorise que du lundi au vendredi, non conforme à la demande']],
        attendu: /droits ou parametrage/ }),

    cas('acc-03', 'acces', 'Lecteur muet depuis des travaux de peinture',
      'Porte de service avec contrôle d’accès : plus aucun badge n’est lu sur le lecteur extérieur depuis les travaux de peinture, pas de bip, voyant éteint. ' +
      'Le lecteur intérieur de la même porte fonctionne.',
      { validation: true,
        faits: [[/code defaut/, 'Non']],
        controles: [
          [/badge de reference/, 'Aucun bip, aucun événement dans le journal : non conforme'],
          [/aux bornes du lecteur et controler/, 'Aucune tension aux bornes du lecteur : fil d’alimentation arraché dans le boîtier'],
          [/sortie de l.alimentation/, '12,1 V en sortie d’alimentation, mais aucune tension aux bornes du lecteur extérieur'],
          [/son fusible/, 'Fusible bon, secteur présent, bornes serrées', 'c']],
        attendu: /lecteur/ }),

    cas('acc-04', 'acces', 'Porte qui reste déverrouillée en permanence (bouton de sortie)',
      'Porte du local technique sous contrôle d’accès : elle reste déverrouillée en permanence depuis ce matin, la ventouse ne colle plus. Les badges sont lus normalement. ' +
      'Du carrelage a été posé hier dans le couloir.',
      { faits: [[/code defaut/, 'Non']],
        controles: [
          [/debrancher le bouton de sortie/, 'Dès que je débranche le bouton à la centrale, la ventouse recolle : non conforme'],
          [/contact a l.ohmmetre/, 'Bouton poussoir : contact fermé en permanence, mécanisme enfoncé et coincé par de la colle à carrelage'],
          [/tension aux bornes de la ventouse/, 'Aucune tension aux bornes de la ventouse'],
          [/contre-plaque/, 'Contre-plaque propre et alignée', 'c']],
        attendu: /bouton poussoir/ }),

    cas('acc-05', 'acces', 'Portail qui refuse de se refermer (photocellules)',
      'Portail coulissant motorisé d’un parking : il s’ouvre normalement mais refuse de se refermer, le feu clignote et il reste ouvert. Ça a commencé après la tonte de la pelouse.',
      { validation: true,
        faits: [[/code defaut/, 'Non']],
        controles: [
          [/photocellules/, 'Voyant du récepteur éteint : la cellule a été heurtée, elle est désalignée et pointe à côté de l’émetteur']],
        attendu: /photocellules/ }),

    cas('acc-06', 'acces', 'Gâche qui bourdonne sans libérer la porte',
      'Porte palière avec gâche électrique et lecteur de badge : au badge on entend la gâche bourdonner mais la porte ne s’ouvre pas, sauf si on tire fort sur la poignée en même temps. ' +
      'C’est pire depuis qu’il fait froid.',
      { faits: [[/code defaut/, 'Non']],
        controles: [
          [/commander la gache porte ouverte/, 'Porte ouverte la gâche libère bien ; porte fermée le pêne force sur la gâche, il faut tirer la porte pour libérer : non conforme'],
          [/tension aux bornes de la gache/, '12,2 V présents à l’ordre, conforme', 'c']],
        attendu: /gache en contrainte/ }),

    cas('acc-07', 'acces', 'Centrale qui redémarre à chaque microcoupure (batterie)',
      'Contrôle d’accès d’une agence : à chaque microcoupure secteur, la centrale redémarre, les portes se déverrouillent quelques secondes et l’heure est perdue. ' +
      'Un défaut batterie s’affiche de temps en temps.',
      { controles: [
          [/tension de la batterie/, 'Secteur coupé : la batterie tombe à 9,1 V en quelques secondes ; elle a sept ans']],
        attendu: /batterie de secours/ })
  ];
};
