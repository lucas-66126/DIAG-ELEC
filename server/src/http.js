'use strict';
/**
 * Serveur HTTP (node:http, sans framework) : API de l'agent + fichiers statiques de la PWA.
 *
 * Sécurité : CORS limité aux origines autorisées, jeton d'accès applicatif (X-App-Token) si configuré,
 * taille des requêtes limitée, chemins confinés, aucune clé renvoyée au client.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DM = require('./core');
const { runAgentTurn } = require('./agent/run');

const VERSION = '2.1.0';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8'
};
const ERROR_STATUS = {
  bad_request: 400, no_user_message: 400, auth: 502, permission: 502, model_not_found: 502, not_configured: 503,
  not_implemented: 501, rate_limit: 429, overloaded: 503, network: 504, timeout: 504, upstream: 502, truncated: 502, internal: 500
};

function send(res, status, obj, headers) {
  const body = JSON.stringify(obj);
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers || {}));
  res.end(body);
}
function sendError(res, err) {
  const code = err.code || 'internal';
  const status = err.status || ERROR_STATUS[code] || 500;
  if (status >= 500) console.error('[DIAG-MAINT]', code, err.message);
  send(res, status, { error: { code: code, message: err.message || 'Erreur', retryable: !!err.retryable } });
}

function readBody(req, maxBytes) {
  return new Promise(function (resolve, reject) {
    let size = 0;
    const chunks = [];
    req.on('data', function (c) {
      size += c.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error('Requête trop volumineuse.'), { status: 413, code: 'bad_request' }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', function () {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(Object.assign(new Error('JSON invalide.'), { status: 400, code: 'bad_request' })); }
    });
    req.on('error', reject);
  });
}

function safeEqual(a, b) {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

function isLoopbackOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin || '');
}

/**
 * @param {object} deps { config, providers, documents, knowledge, images }
 */
function createServer(deps) {
  const cfg = deps.config;
  const maxBody = (cfg.maxUploadMb + 2) * 1024 * 1024 * 1.4; // base64 + JSON

  function cors(req, res) {
    const origin = req.headers.origin;
    if (!origin) return true;
    const self = 'http://' + req.headers.host;
    if (origin === self || cfg.allowedOrigins.indexOf(origin) !== -1 || isLoopbackOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Token');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '600');
      return true;
    }
    return false;
  }

  function authorized(req) {
    if (!cfg.accessToken) return true;
    return safeEqual(req.headers['x-app-token'] || '', cfg.accessToken);
  }

  async function api(req, res, url) {
    const p = url.pathname;
    const m = req.method;

    if (p === '/api/health' && m === 'GET') {
      return send(res, 200, {
        ok: true, app: 'DIAG-MAINT', version: VERSION,
        provider: deps.providers.describe(),
        features: { documents: true, knowledge: true, images: true, webSearch: !!(deps.providers.describe().webSearch) },
        auth: { required: !!cfg.accessToken, valid: authorized(req) }
      });
    }
    if (!authorized(req)) return send(res, 401, { error: { code: 'unauthorized', message: 'Jeton d’accès manquant ou invalide (Réglages → Serveur IA).', retryable: false } });

    if (p === '/api/agent/turn' && m === 'POST') {
      const body = await readBody(req, maxBody);
      const out = await runAgentTurn(deps, body);
      return send(res, 200, out);
    }

    if (p === '/api/documents' && m === 'GET') {
      const q = Object.fromEntries(url.searchParams.entries());
      const hasFilter = ['manufacturer', 'category', 'model', 'reference', 'q', 'query'].some(function (k) { return q[k]; });
      return send(res, 200, { documents: hasFilter ? deps.documents.search(q) : deps.documents.all(), tree: deps.documents.tree() });
    }
    if (p === '/api/documents' && m === 'POST') {
      const body = await readBody(req, maxBody);
      const doc = deps.documents.add(body.meta || {}, body.mediaType, body.data);
      return send(res, 201, { document: doc });
    }
    let mm = p.match(/^\/api\/documents\/(doc_[a-z0-9]+)\/file$/i);
    if (mm && m === 'GET') {
      const f = deps.documents.fileBuffer(mm[1]);
      if (!f) return send(res, 404, { error: { code: 'not_found', message: 'Document introuvable.' } });
      res.writeHead(200, { 'Content-Type': f.doc.mediaType, 'Content-Length': f.buffer.length, 'Cache-Control': 'private, max-age=3600',
        'Content-Disposition': 'inline; filename="' + f.doc.filename + '"' });
      return res.end(f.buffer);
    }
    mm = p.match(/^\/api\/documents\/(doc_[a-z0-9]+)$/i);
    if (mm && m === 'DELETE') {
      return send(res, deps.documents.remove(mm[1]) ? 200 : 404, { ok: true });
    }

    if (p === '/api/knowledge' && m === 'POST') {
      const body = await readBody(req, maxBody);
      const n = deps.knowledge.upsertDiagnostics(Array.isArray(body.diagnostics) ? body.diagnostics : []);
      return send(res, 200, { accepted: n });
    }
    if (p === '/api/knowledge/search' && m === 'GET') {
      const q = Object.fromEntries(url.searchParams.entries());
      const res2 = DM.kb.search(deps.knowledge.all(), { mode: q.mode, text: q.text, reference: q.reference, code: q.code, symptom: q.symptom, limit: 20 });
      return send(res, 200, { results: res2 });
    }
    return send(res, 404, { error: { code: 'not_found', message: 'Route inconnue.' } });
  }

  function serveStatic(req, res, url) {
    if (!cfg.serveStatic || (req.method !== 'GET' && req.method !== 'HEAD')) { res.writeHead(404); return res.end(); }
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    // le code serveur, les données et les fichiers cachés ne sont jamais servis
    if (/^(server|node_modules)(\/|$)/i.test(rel) || rel.split('/').some(function (seg) { return seg.startsWith('.'); })) { res.writeHead(404); return res.end(); }
    const file = path.resolve(DM.ROOT, rel);
    const r = path.relative(DM.ROOT, file);
    if (r.startsWith('..') || path.isAbsolute(r) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('404'); }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  }

  return http.createServer(function (req, res) {
    const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
    const isApi = url.pathname.startsWith('/api/');
    if (isApi) {
      const allowed = cors(req, res);
      if (req.method === 'OPTIONS') { res.writeHead(allowed ? 204 : 403); return res.end(); }
      if (!allowed) return send(res, 403, { error: { code: 'forbidden_origin', message: 'Origine non autorisée (ALLOWED_ORIGINS).' } });
      return api(req, res, url).catch(function (err) { sendError(res, err); });
    }
    serveStatic(req, res, url);
  });
}

module.exports = { createServer, VERSION };
