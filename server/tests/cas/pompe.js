'use strict';
/* Banque de cas — pompes, surpresseurs, relevage, circulateurs. */
module.exports = function (cas) {
  return [
    cas('pmp-01', 'pompe', 'Surpresseur qui démarre toutes les 15 secondes (réservoir à vessie)',
      'Surpresseur d’eau d’un immeuble : la pompe démarre et s’arrête toutes les 10 à 15 secondes dès qu’on ouvre un robinet, le manomètre oscille fort. ' +
      'Le pressostat a été changé le mois dernier sans amélioration.',
      { controles: [
          [/pression de gonflage/, 'Réservoir vidangé : 0,2 bar à la valve, beaucoup trop bas pour un enclenchement à 2,5 bar'],
          [/appuyer brievement sur la valve/, 'Il sort de l’air sec, aucune goutte', 'c'],
          [/pressions reelles d.enclenchement/, 'Enclenche à 2,5 bar, coupe à 4 bar : conforme aux réglages', 'c']],
        attendu: /reservoir a vessie/ }),

    cas('pmp-02', 'pompe', 'Pompe de relevage qui déclenche à chaque démarrage (roue bloquée)',
      'Poste de relevage d’eaux usées d’un lotissement, deux pompes : la pompe 1 fait déclencher son relais thermique à chaque démarrage, elle bourdonne. La pompe 2 fonctionne. ' +
      'Les flotteurs ont été remplacés l’an dernier.',
      { faits: [[/plaque moteur/, 'Pompe 400 V, 2,2 kW, 5 A, relais thermique réglé à 5 A'], [/combien de temps/, 'Immédiatement, au démarrage']],
        controles: [
          [/intensite absorbee par la pompe/, '14 A au démarrage puis déclenchement, très au-dessus de la plaque : non conforme'],
          [/roue et la volute/, 'Roue bloquée par un paquet de lingettes enroulé autour'],
          [/intensite sur chaque phase/, 'L1 : 13,8 A · L2 : 14,1 A · L3 : 13,9 A, très au-dessus de la plaque'],
          [/tourner l.arbre a la main/, 'Pompe relevée : la roue est bloquée par des lingettes enroulées']],
        attendu: /roue bloquee/ }),

    cas('pmp-03', 'pompe', 'Pompe de puits qui se désamorce à l’arrêt (clapet de pied)',
      'Pompe de surface sur puits, aspiration à 5 m : elle tourne mais ne refoule plus après chaque arrêt prolongé ; il faut la remplir à la main pour qu’elle reparte. ' +
      'Ensuite elle fonctionne des heures sans problème.',
      { validation: true,
        controles: [
          [/clapet de pied/, 'Niveau du puits correct, mais la colonne d’aspiration se vide à l’arrêt : le clapet de pied fuit'],
          [/etancheite de la conduite d.aspiration/, 'Aucune entrée d’air sur les raccords, conforme', 'c']],
        attendu: /desamorcage/ }),

    cas('pmp-04', 'pompe', 'Débit faible après remplacement du moteur (sens de rotation)',
      'Pompe de circulation d’eau glacée remise en service après le remplacement de son moteur : débit très faible, pression au refoulement à la moitié de la normale, pas de bruit anormal, ' +
      'intensité plus basse que d’habitude.',
      { controles: [
          [/sens de rotation/, 'La pompe tourne à l’inverse de la flèche : non conforme']],
        attendu: /sens de rotation inverse/ }),

    cas('pmp-05', 'pompe', 'Fosse pleine, pompe qui ne démarre pas (flotteur coincé)',
      'Fosse de relevage d’un sous-sol : la pompe ne démarre pas alors que la fosse est pleine et que l’alarme niveau haut sonne. En marche forcée au coffret, elle vide la fosse normalement.',
      { controles: [
          [/basculer le flotteur/, 'Flotteur basculé à la main : le contact change bien d’état et la pompe démarre, conforme', 'c'],
          [/liberte du flotteur/, 'Flotteur coincé sous une couche de graisse figée, câble emmêlé avec celui de la pompe']],
        attendu: /flotteur/ }),

    cas('pmp-06', 'pompe', 'Surpresseur qui redémarre seul la nuit (clapet anti-retour)',
      'Surpresseur d’un bâtiment de bureaux : la pompe redémarre seule toutes les 20 minutes la nuit, sans aucun puisage, et la pression retombe lentement à l’arrêt. ' +
      'Pas de fuite visible dans le bâtiment. Le réservoir a été regonflé le mois dernier.',
      { validation: true,
        controles: [
          [/vanne de refoulement vers le reseau fermee/, 'Vanne fermée côté réseau : la pression continue de chuter, de 4 à 2,5 bar en cinq minutes : non conforme'],
          [/inspecter le clapet/, 'Clapet anti-retour : un morceau de téflon coincé sur le siège, il ne ferme plus'],
          [/pression de gonflage/, '2,3 bar pour un enclenchement à 2,5 bar, conforme', 'c']],
        attendu: /clapet anti-retour/ }),

    cas('pmp-07', 'pompe', 'Eau qui goutte sous la pompe (garniture mécanique)',
      'Pompe centrifuge d’un réseau d’eau chaude : de l’eau goutte en continu sous la pompe au niveau de la sortie d’arbre, avec des traces de calcaire. Débit et pression normaux.',
      { controles: [
          [/sortie d.arbre/, 'Fuite continue le long de l’arbre, garniture mécanique marquée']],
        attendu: /garniture mecanique/ }),

    cas('pmp-08', 'pompe', 'Radiateurs froids à la remise en chauffe (circulateur gommé)',
      'Chaufferie : à la remise en chauffe d’octobre, les radiateurs d’une aile restent froids alors que la chaudière est chaude. Le circulateur de ce circuit bourdonne et son corps est très chaud.',
      { controles: [
          [/bouchon de degommage/, 'Arbre bloqué, impossible à tourner au tournevis']],
        attendu: /circulateur bloque/ })
  ];
};
