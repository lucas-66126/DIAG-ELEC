'use strict';
/* Banque de cas — moteurs électriques et variateurs. */
module.exports = function (cas) {
  return [
    cas('mot-01', 'moteur', 'Moteur qui bourdonne sans démarrer (phase manquante)',
      'Moteur de ventilateur de tour aéroréfrigérante, 7,5 kW : il bourdonne sans démarrer et la protection déclenche au bout de quelques secondes. La veille il tournait normalement. ' +
      'Roulements changés il y a un an.',
      { faits: [[/differentiel/, 'Non'], [/combien de temps/, 'Après quelques secondes']],
        controles: [
          [/trois tensions entre phases/, 'En aval du sectionneur : L1-L2 : 401 V · L2-L3 : 180 V · L1-L3 : 215 V'],
          [/continuite de chaque phase/, 'Fusible de la phase L3 fondu dans le sectionneur porte-fusibles']],
        attendu: /perte de phase/ }),

    cas('mot-02', 'moteur', 'Différentiel qui déclenche après un lavage (bobinage humide)',
      'Moteur d’un convoyeur en zone de lavage : depuis le nettoyage au jet haute pression de vendredi, le différentiel 300 mA de l’armoire déclenche dès qu’on lance le moteur. ' +
      'Le variateur voisin est sur un autre départ, il fonctionne.',
      { faits: [[/combien de temps/, 'Immédiatement']],
        controles: [
          [/ensemble cable \+ moteur/, 'Depuis l’armoire, câble + moteur : 0,15 MΩ'],
          [/moteur deconnecte/, 'Moteur seul, barrettes retirées : 0,12 MΩ entre enroulements et masse ; boîte à bornes pleine d’eau'],
          [/cable debranche aux deux/, 'Câble seul : > 500 MΩ', 'c']],
        attendu: /isolement du bobinage/ }),

    cas('mot-03', 'moteur', 'Grognement et palier brûlant (roulement)',
      'Moteur de ventilateur d’extraction en toiture, 15 kW : bruit de grognement qui augmente depuis trois semaines, vibrations, et le palier côté accouplement est brûlant au toucher. ' +
      'Courants normaux et équilibrés.',
      { validation: true,
        controles: [
          [/ecouter chaque palier/, 'Grondement net côté accouplement, palier à 92 °C contre 48 °C de l’autre côté : non conforme'],
          [/tourner l.arbre a la main/, 'Arbre désaccouplé : point dur et jeu radial sensible côté accouplement']],
        attendu: /roulements uses|roulement ou palier/ }),

    cas('mot-04', 'moteur', 'Relais thermique qui déclenche, trois phases chargées (surcharge mécanique)',
      'Convoyeur à vis d’alimentation d’un silo : le relais thermique du moteur déclenche plusieurs fois par jour, plutôt quand le produit est humide. Moteur de 5,5 kW neuf de deux mois.',
      { faits: [[/plaque moteur/, 'Moteur 400 V, 5,5 kW, 11 A, démarrage direct, relais thermique réglé à 11 A'], [/combien de temps/, 'De façon aléatoire']],
        controles: [
          [/intensite sur chaque phase/, 'L1 : 13,2 A · L2 : 13,4 A · L3 : 13,1 A, au-dessus de la plaque'],
          [/tourner l.arbre a la main/, 'Vis consignée : point dur, produit colmaté dans l’auge et palier intermédiaire grippé'],
          [/reglage du relais thermique/, 'Réglé à 11 A pour 11 A plaque, conforme', 'c']],
        attendu: /surcharge mecanique/ }),

    cas('mot-05', 'moteur', 'Moteur neuf sans force (couplage)',
      'Moteur de remplacement posé avant-hier sur un malaxeur (plaque 400/690 V, réseau 400 V) : il tourne mais sans force, cale dès qu’on charge et chauffe. ' +
      'L’ancien moteur fonctionnait bien. Même câble, même protection.',
      { controles: [
          [/barrettes/, 'Barrettes montées en étoile alors que la plaque demande le triangle sur un réseau 400 V : non conforme']],
        attendu: /couplage incorrect/ }),

    cas('mot-06', 'moteur', 'Variateur en défaut l’après-midi (surchauffe)',
      'Variateur 22 kW d’un moteur de ventilateur de process : il se met en défaut l’après-midi quand il fait chaud dans le local, puis repart après une demi-heure d’arrêt. ' +
      'Aucun problème le matin. Le moteur a été contrôlé, il est bon.',
      { validation: true,
        faits: [[/code defaut est-il/, 'Oui'], [/quel code/, 'OH, surchauffe du radiateur']],
        controles: [
          [/code defaut affiche par le variateur/, 'Historique : défaut surchauffe du radiateur, 6 fois en 10 jours, toujours entre 14 h et 17 h : non conforme'],
          [/proprete du radiateur/, 'Ventilateur du variateur bloqué par la poussière, filtres d’armoire colmatés']],
        attendu: /variateur : surchauffe/ }),

    cas('mot-07', 'moteur', 'Roulements qui lâchent à répétition (alignement)',
      'Groupe moteur + ventilateur accouplés : troisième remplacement des roulements du moteur en huit mois, toujours côté accouplement. Vibrations dès la remise en route. ' +
      'Le moteur a été remplacé une fois, sans changement.',
      { controles: [
          [/alignement moteur/, 'Défaut d’alignement mesuré au comparateur : 0,6 mm, hors tolérance ; élastomère de l’accouplement déchiré']],
        attendu: /desalignement/ }),

    cas('mot-08', 'moteur', 'Moteur brûlant avec des courants normaux (ventilation)',
      'Moteur de broyeur en atelier poussiéreux : il est brûlant au toucher et sa sonde PTC le fait arrêter en fin de poste. Les trois courants sont normaux et équilibrés, sous la plaque. ' +
      'La tension est correcte.',
      { controles: [
          [/capot de ventilation/, 'Capot de ventilation colmaté par la sciure, ailettes recouvertes']],
        attendu: /ventilation du moteur/ }),

    cas('mot-09', 'moteur', 'Moteur monophasé qui ronfle sans partir (condensateur)',
      'Petit moteur monophasé 230 V d’un extracteur d’atelier : il ronfle sans démarrer, et part si on lance l’hélice à la main.',
      { validation: true,
        controles: [
          [/capacite/, 'Condensateur marqué 16 µF, mesuré à 4,2 µF : hors tolérance']],
        attendu: /condensateur de moteur monophase/ })
  ];
};
