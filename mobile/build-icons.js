'use strict';
/**
 * Fabrique les images sources des icônes Android (dossier assets/) à partir du dessin de l'icône.
 * « npm run icones » génère ensuite toutes les tailles dans le projet Android.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = path.join(__dirname, 'assets');
fs.mkdirSync(OUT, { recursive: true });

const BOLT = '<path d="M290 72 150 280h100l-24 160 140-212H264z" fill="#f2b705"/>';
// icône complète (fond sombre, bandeau jaune, éclair)
const full = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#232a33"/>' +
  '<rect x="0" y="440" width="512" height="72" fill="#f2b705"/>' + BOLT + '</svg>';
// icône adaptative : l'éclair seul, réduit pour tenir dans la zone toujours visible
const foreground = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g transform="translate(128 128) scale(0.5)">' + BOLT + '</g></svg>';
const background = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#232a33"/></svg>';
// écran de démarrage : éclair centré sur fond sombre
const splash = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732"><rect width="2732" height="2732" fill="#111418"/>' +
  '<g transform="translate(1110 1110)">' + BOLT + '</g></svg>';

(async function () {
  await sharp(Buffer.from(full)).resize(1024, 1024).png().toFile(path.join(OUT, 'icon-only.png'));
  await sharp(Buffer.from(foreground)).resize(1024, 1024).png().toFile(path.join(OUT, 'icon-foreground.png'));
  await sharp(Buffer.from(background)).resize(1024, 1024).png().toFile(path.join(OUT, 'icon-background.png'));
  await sharp(Buffer.from(splash)).resize(2732, 2732).png().toFile(path.join(OUT, 'splash.png'));
  await sharp(Buffer.from(splash)).resize(2732, 2732).png().toFile(path.join(OUT, 'splash-dark.png'));
  // icône de la fiche Play Store (512 × 512) et bandeau de présentation (1024 × 500)
  const store = path.join(__dirname, 'play-store');
  fs.mkdirSync(store, { recursive: true });
  await sharp(Buffer.from(full)).resize(512, 512).png().toFile(path.join(store, 'icone-512.png'));
  const banner = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 500"><rect width="1024" height="500" fill="#232a33"/>' +
    '<rect x="0" y="452" width="1024" height="48" fill="#f2b705"/>' +
    '<g transform="translate(70 96) scale(0.6)">' + BOLT + '</g>' +
    '<text x="330" y="235" font-family="Arial, Helvetica, sans-serif" font-size="92" font-weight="700" fill="#ffffff">DIAG-MAINT</text>' +
    '<text x="332" y="305" font-family="Arial, Helvetica, sans-serif" font-size="31" fill="#f2b705">Diagnostic de pannes pour la maintenance</text></svg>';
  await sharp(Buffer.from(banner)).resize(1024, 500).png().toFile(path.join(store, 'bandeau-1024x500.png'));
  console.log('images sources prêtes dans assets/ et play-store/');
})().catch(function (e) { console.error(e); process.exit(1); });
