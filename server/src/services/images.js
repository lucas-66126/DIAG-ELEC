'use strict';
/**
 * Copie serveur des photos envoyées par le téléphone, pour que l'agent puisse les réexaminer
 * (outil analyze_image) lors d'un tour ultérieur. data/uploads/<diagId>/<photoId>.<ext>
 */
const fs = require('fs');
const path = require('path');
const files = require('./files');

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

class ImageStore {
  constructor(dataDir, opts) {
    this.dir = files.ensureDir(path.join(dataDir, 'uploads'));
    this.maxBytes = ((opts && opts.maxUploadMb) || 25) * 1024 * 1024;
  }
  save(diagId, photoId, mediaType, data) {
    if (!files.isValidId(diagId) || !files.isValidId(photoId)) throw Object.assign(new Error('Identifiant de photo invalide.'), { status: 400 });
    if (!EXT[mediaType]) throw Object.assign(new Error('Format d’image non accepté.'), { status: 415 });
    const buf = Buffer.from(String(data || ''), 'base64');
    if (!buf.length || buf.length > this.maxBytes) throw Object.assign(new Error('Image vide ou trop volumineuse.'), { status: 413 });
    const dir = files.ensureDir(files.inside(this.dir, diagId));
    Object.keys(EXT).forEach(function (mt) { try { fs.unlinkSync(path.join(dir, photoId + '.' + EXT[mt])); } catch (e) { /* rien */ } });
    files.writeFileAtomic(files.inside(dir, photoId + '.' + EXT[mediaType]), buf);
  }
  async get(diagId, photoId) {
    if (!files.isValidId(diagId) || !files.isValidId(photoId)) return null;
    for (const mt of Object.keys(EXT)) {
      const f = path.join(this.dir, diagId, photoId + '.' + EXT[mt]);
      if (fs.existsSync(f)) return { mediaType: mt, data: fs.readFileSync(f).toString('base64') };
    }
    return null;
  }
}

module.exports = { ImageStore };
