'use strict';
/* Banque de cas — maintenance industrielle. */
module.exports = function (cas) {
  return [
    cas('ind-01', 'industriel', 'Sifflement au démarrage, débit en baisse (courroies)',
      'Ventilateur de dépoussiérage entraîné par courroies : sifflement strident à chaque démarrage, débit d’aspiration en baisse et poussière noire sous le carter. ' +
      'Le moteur a été changé il y a deux mois.',
      { controles: [
          [/tension de la courroie/, 'Courroies détendues, flancs lustrés, une courroie fissurée']],
        attendu: /courroie detendue/ }),

    cas('ind-02', 'industriel', 'Tous les vérins lents en fin de poste (filtre d’air colmaté)',
      'Machine d’assemblage pneumatique : tous les vérins sont devenus lents et manquent de force en fin de poste. Le compresseur de l’atelier est en bon état.',
      { controles: [
          [/pression au reseau/, '7 bar au réseau, mais 3,8 bar après le filtre-régulateur quand la machine est en cycle : non conforme'],
          [/filtre du groupe de conditionnement/, 'Cartouche du filtre colmatée, bol plein d’eau et de boue']],
        attendu: /pression d.air insuffisante/ }),

    cas('ind-03', 'industriel', 'Pompe hydraulique bruyante, huile mousseuse',
      'Presse hydraulique : la pompe du groupe est devenue très bruyante, les mouvements sont saccadés et l’huile dans le réservoir est mousseuse. ' +
      'Une flaque a été nettoyée sous la machine la semaine dernière.',
      { validation: true,
        controles: [
          [/aspect de l.huile/, 'Niveau sous le repère mini, huile mousseuse']],
        attendu: /niveau d.huile hydraulique bas/ }),

    cas('ind-04', 'industriel', 'Machine qui refuse de démarrer, défaut sécurité (porte de carter)',
      'Machine d’emballage : impossible de démarrer, le voyant défaut sécurité reste allumé au pupitre. Tous les arrêts d’urgence ont été déverrouillés. ' +
      'Une porte de carter a été changée la semaine dernière.',
      { controles: [
          [/module de securite/, 'Module de sécurité : canal 2 ouvert, réarmement impossible, non conforme'],
          [/protecteur designe/, 'Interrupteur de la porte de carter neuve : clé mal alignée, un des deux contacts ne se ferme pas'],
          [/continuite de chaque canal/, 'Canal 2 ouvert au niveau de l’interrupteur de la porte de carter : clé mal alignée']],
        attendu: /securite/ }),

    cas('ind-05', 'industriel', 'Un seul vérin lent qui ne tient plus (fuite interne)',
      'Poste de sertissage pneumatique : un seul vérin, celui du serrage, est devenu lent et ne tient plus la pièce ; les autres vérins de la machine sont normaux. ' +
      'Son distributeur a été remplacé hier, sans effet.',
      { controles: [
          [/echappement de son distributeur/, 'Vérin en bout de course : fuite d’air continue à l’échappement du distributeur'],
          [/pression au reseau/, '6,2 bar au réseau et 6 bar à la machine en cycle, conforme', 'c']],
        attendu: /verin : fuite interne/ }),

    cas('ind-06', 'industriel', 'Bande de convoyeur qui se déporte',
      'Convoyeur à bande de 12 m : la bande se déporte vers la gauche et frotte sur le châssis, le bord s’effiloche. C’est apparu progressivement. Le produit transporté est collant.',
      { validation: true,
        controles: [
          [/proprete des tambours/, 'Tambour de renvoi encrassé de produit collé sur un côté']],
        attendu: /bande de convoyeur/ }),

    cas('ind-07', 'industriel', 'Compresseur d’air qui plafonne à 7 bar',
      'Compresseur d’air à pistons de l’atelier : il tourne presque sans arrêt et n’atteint plus sa pression de coupure à 10 bar, il plafonne à 7 bar. Aucune fuite nouvelle repérée sur le réseau.',
      { controles: [
          [/chronometrer la montee en pression/, 'Vanne de cuve fermée : il met 14 minutes au lieu de 5 et plafonne toujours à 7 bar, non conforme'],
          [/filtre d.aspiration, les clapets/, 'Clapets de refoulement cassés sur le premier étage, filtre d’aspiration colmaté']],
        attendu: /compresseur d.air/ }),

    cas('ind-08', 'industriel', 'Motoréducteur qui craque et chauffe',
      'Motoréducteur d’un malaxeur : bruit de craquement, carter du réducteur brûlant et trace d’huile sous l’arbre de sortie. Le moteur lui-même est froid et ses courants sont normaux.',
      { controles: [
          [/huile du reducteur/, 'Niveau d’huile très bas, limaille sur le bouchon magnétique, joint d’arbre de sortie qui fuit']],
        attendu: /reducteur/ }),

    cas('ind-09', 'industriel', 'Presse qui n’a plus de force (limiteur de pression)',
      'Presse à compacter hydraulique : elle fait ses mouvements mais n’a plus de force, les balles sortent mal serrées. Niveau d’huile correct, pas de fuite visible, huile changée il y a six mois.',
      { controles: [
          [/pression au manometre en butee/, '90 bar en butée pour 180 bar au schéma : non conforme'],
          [/tarage du limiteur/, 'Limiteur de pression déréglé : contre-écrou desserré, vis de tarage dévissée'],
          [/aspect de l.huile/, 'Niveau correct, huile limpide', 'c']],
        attendu: /pression hydraulique insuffisante/ })
  ];
};
