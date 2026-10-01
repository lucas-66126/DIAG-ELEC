'use strict';
/* Banque de cas — électrotechnique / armoires de commande. */
module.exports = function (cas) {
  return [
    cas('etk-01', 'electrotechnique', 'Contacteur qui ne colle plus (bobine coupée)',
      'Armoire de ventilation : le contacteur KM1 de l’extracteur ne colle plus à l’ordre de marche. Le voyant sous tension est allumé, le relais thermique n’est pas déclenché. ' +
      'Le bouton marche a été remplacé le mois dernier.',
      { controles: [
          [/point par point/, 'Tension de commande 24 V présente jusqu’à la borne A1 de KM1 à l’ordre de marche, rien d’anormal', 'c'],
          [/secondaire du transformateur/, '24,6 V au secondaire et en aval des fusibles, conforme', 'c'],
          [/resistance de la bobine/, 'Bobine de KM1 : résistance infinie, bobine coupée']],
        attendu: /bobine de contacteur/ }),

    cas('etk-02', 'electrotechnique', 'Armoire sans aucune réaction (fusible de commande)',
      'Armoire de commande d’un malaxeur : plus rien ne se passe quand on appuie sur marche, aucun voyant allumé sur la porte, aucune réaction des contacteurs. ' +
      'La puissance est présente, sectionneur fermé. Un contacteur a claqué fort hier avant l’arrêt.',
      { controles: [
          [/secondaire du transformateur/, '0 V au secondaire du transformateur, non conforme'],
          [/fusibles primaire et secondaire/, 'Fusible primaire du transformateur fondu ; la bobine du contacteur KM2 est en court-circuit']],
        attendu: /absence de tension de commande/ }),

    cas('etk-03', 'electrotechnique', 'Contacteur qui ne colle plus après un déclenchement thermique',
      'Armoire d’un broyeur : après un déclenchement du relais thermique hier, on a réarmé mais le contacteur ne colle toujours pas à l’ordre de marche. ' +
      'Voyant sous tension allumé. Le moteur a été contrôlé, il est bon.',
      { validation: true,
        controles: [
          [/secondaire du transformateur/, '230 V au secondaire, conforme', 'c'],
          [/point par point/, 'Tension présente jusqu’à la borne 95 du relais thermique, absente sur la borne 96'],
          [/element repere/, 'Contact 95-96 du relais thermique F1 : circuit ouvert même relais réarmé']],
        attendu: /chaine de commande ouverte/ }),

    cas('etk-04', 'electrotechnique', 'Contacteur qui vibre et retombe (tension de commande faible)',
      'Armoire de chaufferie : le contacteur de la pompe de charge vibre et claque par moments, surtout quand les autres pompes démarrent ; il lui arrive de retomber. ' +
      'Ce contacteur a été remplacé il y a quinze jours, même symptôme.',
      { controles: [
          [/a1-a2 de sa bobine/, 'Contacteur collé : 17,8 V aux bornes de la bobine quand les autres pompes tournent, trop faible'],
          [/a vide puis avec tous/, 'Secondaire du transformateur : 24,3 V à vide, il chute à 18,2 V tous contacteurs collés'],
          [/faces polaires/, 'Faces polaires propres, contacteur neuf', 'c']],
        attendu: /tension de commande trop faible/ }),

    cas('etk-05', 'electrotechnique', 'Moteur qui ne s’arrête plus (contacts soudés)',
      'Armoire d’un convoyeur : le moteur continue de tourner après appui sur arrêt ; il faut couper au sectionneur. C’est arrivé après un bourrage qui a fait disjoncter.',
      { controles: [
          [/continuite de chaque pole/, 'KM1 au repos : le pôle 3-4 est passant, il est soudé ; les deux autres sont ouverts'],
          [/etat des contacts de puissance/, 'Contacts du pôle central soudés, perles de métal']],
        attendu: /contacts de puissance/ }),

    cas('etk-06', 'electrotechnique', 'Moteur qui s’arrête dès qu’on relâche le bouton',
      'Coffret de commande d’une scie : le moteur démarre quand on appuie sur le bouton marche mais s’arrête dès qu’on relâche. Le bouton arrêt et l’arrêt d’urgence fonctionnent.',
      { validation: true,
        controles: [
          [/auto-maintien/, 'Contact auxiliaire 13-14 de KM1 : il reste ouvert quand on actionne le contacteur à la main']],
        attendu: /auto-maintien/ }),

    cas('etk-07', 'electrotechnique', 'Démarreur étoile-triangle qui reste en étoile',
      'Démarreur étoile-triangle d’un ventilateur de 30 kW : le moteur démarre, ne monte pas en vitesse, et le disjoncteur déclenche au bout d’une quinzaine de secondes. ' +
      'L’armoire a été nettoyée à l’air comprimé la semaine dernière.',
      { faits: [[/combien de temps/, 'Après une quinzaine de secondes'], [/differentiel/, 'Non']],
        controles: [
          [/sequence de demarrage/, 'Le contacteur triangle ne colle jamais : le moteur reste en étoile jusqu’au déclenchement'],
          [/relais temporise/, 'Relais temporisé : son contact ne bascule pas, il reste en position étoile']],
        attendu: /etoile-triangle/ })
  ];
};
