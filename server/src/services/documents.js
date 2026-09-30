'use strict';
/**
 * Base documentaire : notices, schémas, manuels, fiches techniques (PDF, images, texte).
 * Classement : fabricant › catégorie › série › modèle › référence.
 * Métadonnées dans data/documents/index.json, fichiers dans data/documents/files/.
 *
 * Lecture par l'agent : le fichier est joint tel quel à la conversation (bloc « document » PDF/texte
 * ou « image »), le modèle le lit directement — pas d'extraction de texte côté serveur.
 */
const fs = require('fs');
const path = require('path');
const DM = require('../core');
const files = require('./files');

const TYPES = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'text/plain': 'txt'
};
const DOC_TYPES = ['notice', 'schema', 'manuel', 'fiche_technique', 'codes_defaut', 'autre'];
const META_FIELDS = ['title', 'manufacturer', 'category', 'series', 'model', 'reference', 'docType', 'notes'];

function clean(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 200); }

class DocumentStore {
  constructor(dataDir, opts) {
    this.dir = files.ensureDir(path.join(dataDir, 'documents'));
    this.filesDir = files.ensureDir(path.join(this.dir, 'files'));
    this.indexFile = path.join(this.dir, 'index.json');
    this.maxBytes = ((opts && opts.maxUploadMb) || 25) * 1024 * 1024;
  }
  all() { return files.readJson(this.indexFile, []); }
  saveIndex(list) { files.writeJson(this.indexFile, list); }
  get(id) { return this.all().find(function (d) { return d.id === id; }) || null; }

  /** Ajoute un document. `data` : contenu encodé en base64. */
  add(meta, mediaType, data) {
    meta = meta || {};
    if (!TYPES[mediaType]) throw Object.assign(new Error('Type de fichier non accepté (PDF, JPEG, PNG, WebP ou texte).'), { status: 415 });
    if (typeof data !== 'string' || !data) throw Object.assign(new Error('Fichier vide.'), { status: 400 });
    const buf = Buffer.from(data, 'base64');
    if (!buf.length) throw Object.assign(new Error('Fichier illisible.'), { status: 400 });
    if (buf.length > this.maxBytes) throw Object.assign(new Error('Fichier trop volumineux.'), { status: 413 });
    if (mediaType === 'application/pdf' && buf.slice(0, 5).toString('latin1') !== '%PDF-') {
      throw Object.assign(new Error('Le fichier n’est pas un PDF valide.'), { status: 400 });
    }
    const doc = { id: DM.uid('doc'), mediaType: mediaType, size: buf.length, createdAt: new Date().toISOString() };
    META_FIELDS.forEach(function (k) { doc[k] = clean(meta[k], k === 'notes' ? 2000 : 200); });
    if (DOC_TYPES.indexOf(doc.docType) === -1) doc.docType = 'autre';
    if (!doc.title) doc.title = [doc.manufacturer, doc.model || doc.reference, doc.docType].filter(Boolean).join(' — ') || 'Document';
    doc.filename = doc.id + '.' + TYPES[mediaType];
    files.writeFileAtomic(files.inside(this.filesDir, doc.filename), buf);
    const list = this.all();
    list.push(doc);
    this.saveIndex(list);
    return doc;
  }

  remove(id) {
    const doc = this.get(id);
    if (!doc) return false;
    try { fs.unlinkSync(files.inside(this.filesDir, doc.filename)); } catch (e) { /* déjà absent */ }
    this.saveIndex(this.all().filter(function (d) { return d.id !== id; }));
    return true;
  }

  fileBuffer(id) {
    const doc = this.get(id);
    if (!doc) return null;
    return { doc: doc, buffer: fs.readFileSync(files.inside(this.filesDir, doc.filename)) };
  }

  /** Recherche par champs (correspondance partielle) et mots-clés ; les plus précis d'abord. */
  search(q) {
    q = q || {};
    const norm = function (s) { return DM.normalize(s).replace(/[^a-z0-9]+/g, ' ').trim(); };
    const compact = function (s) { return DM.normalize(s).replace(/[^a-z0-9]/g, ''); };
    const words = norm(q.query || q.q || '').split(' ').filter(function (w) { return w.length > 2; });
    return this.all().map(function (d) {
      let score = 0;
      if (q.manufacturer) { if (norm(d.manufacturer).indexOf(norm(q.manufacturer)) !== -1) score += 2; else return null; }
      if (q.category) { if (norm(d.category).indexOf(norm(q.category)) !== -1) score += 1; else return null; }
      [['model', 3], ['reference', 4], ['series', 1]].forEach(function (f) {
        const v = q[f[0]];
        if (!v) return;
        const a = compact(d[f[0]]), b = compact(v);
        if (a && b && (a === b)) score += f[1] + 2;
        else if (a && b && (a.indexOf(b) !== -1 || b.indexOf(a) !== -1)) score += f[1];
      });
      if (words.length) {
        const hay = norm([d.title, d.manufacturer, d.category, d.series, d.model, d.reference, d.docType, d.notes].join(' '));
        score += words.filter(function (w) { return hay.indexOf(w) !== -1; }).length;
      }
      const filtered = q.model || q.reference || words.length;
      if (filtered && score <= (q.manufacturer ? 2 : 0) + (q.category ? 1 : 0)) return null;
      return { doc: d, score: score };
    }).filter(Boolean).sort(function (a, b) { return b.score - a.score; }).slice(0, q.limit || 10).map(function (x) { return x.doc; });
  }

  /** Document prêt à être joint à la conversation de l'agent. */
  read(id) {
    const f = this.fileBuffer(id);
    if (!f) return null;
    const data = f.buffer.toString('base64');
    let block;
    if (f.doc.mediaType === 'application/pdf') {
      block = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: data }, title: f.doc.title };
    } else if (f.doc.mediaType === 'text/plain') {
      block = { type: 'document', source: { type: 'text', media_type: 'text/plain', data: f.buffer.toString('utf8') }, title: f.doc.title };
    } else {
      block = { type: 'image', source: { type: 'base64', media_type: f.doc.mediaType, data: data } };
    }
    return { meta: f.doc, block: block };
  }

  /** Arborescence fabricant › catégorie › série › modèle (pour l'interface). */
  tree() {
    const t = {};
    this.all().forEach(function (d) {
      const m = d.manufacturer || 'Sans fabricant', c = d.category || 'Sans catégorie', s = d.series || '—', mo = d.model || d.reference || '—';
      ((((t[m] = t[m] || {})[c] = t[m][c] || {})[s] = t[m][c][s] || {})[mo] = t[m][c][s][mo] || []).push({ id: d.id, title: d.title, docType: d.docType });
    });
    return t;
  }
}

module.exports = { DocumentStore, DOC_TYPES, MEDIA_TYPES: Object.keys(TYPES) };
