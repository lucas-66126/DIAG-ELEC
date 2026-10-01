'use strict';
/**
 * Prépare le dossier www/ embarqué dans l'application Android : uniquement l'interface
 * (pas le serveur, pas les tests, pas le service worker — les fichiers sont déjà dans l'application).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'www');
const ITEMS = ['index.html', 'manifest.webmanifest', 'confidentialite.html', 'css', 'js', 'icons'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let files = 0;
function copy(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    fs.readdirSync(src).forEach(function (n) { copy(path.join(src, n), path.join(dst, n)); });
  } else { fs.copyFileSync(src, dst); files++; }
}
ITEMS.forEach(function (item) {
  const src = path.join(ROOT, item);
  if (!fs.existsSync(src)) throw new Error('Fichier manquant : ' + item);
  copy(src, path.join(OUT, item));
});
// tous les scripts référencés par index.html doivent être dans www/
const html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
const missing = (html.match(/<script src="([^"]+)"/g) || []).map(function (s) { return s.slice(13, -1); })
  .filter(function (s) { return !fs.existsSync(path.join(OUT, s)); });
if (missing.length) throw new Error('Scripts manquants dans www/ : ' + missing.join(', '));
console.log('www/ prêt : ' + files + ' fichiers');
