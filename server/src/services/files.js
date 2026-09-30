'use strict';
/**
 * Stockage de fichiers local (dossier de données du serveur).
 * Tous les chemins sont confinés au dossier de base ; les identifiants sont validés.
 * Remplaçable plus tard par un stockage objet (S3…) derrière la même interface.
 */
const fs = require('fs');
const path = require('path');

const ID_RE = /^[a-z]{2,8}_[a-z0-9]{6,40}$/i;

function isValidId(id) { return typeof id === 'string' && ID_RE.test(id); }

function inside(base, ...parts) {
  const target = path.resolve(base, ...parts);
  const rel = path.relative(base, target);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Chemin refusé.');
  return target;
}

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); return dir; }

function writeFileAtomic(file, data) {
  ensureDir(path.dirname(file));
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function writeJson(file, obj) { writeFileAtomic(file, JSON.stringify(obj, null, 2)); }

module.exports = { isValidId, inside, ensureDir, writeFileAtomic, readJson, writeJson };
