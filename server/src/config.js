'use strict';
/**
 * Configuration du serveur — uniquement par variables d'environnement (fichier server/.env facultatif).
 * Aucune clé n'est jamais écrite dans le code ni transmise au frontend.
 */
const fs = require('fs');
const path = require('path');

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return false;
  if (typeof process.loadEnvFile === 'function') { process.loadEnvFile(file); return true; }
  // repli pour les anciennes versions de Node : KEY=valeur, # commentaires
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach(function (line) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  });
  return true;
}

function bool(v, def) {
  if (v === undefined || v === '') return def;
  return /^(1|true|oui|yes|on)$/i.test(String(v));
}
function int(v, def) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : def; }

function loadConfig(env) {
  env = env || process.env;
  const hasAnthropicCredentials = !!(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
  let provider = (env.AI_PROVIDER || 'auto').toLowerCase();
  if (provider === 'auto') provider = hasAnthropicCredentials ? 'anthropic' : (env.OPENAI_API_KEY ? 'openai' : 'local');
  return {
    port: int(env.PORT, 8787),
    host: env.HOST || '127.0.0.1',
    provider: provider,
    anthropic: {
      // modèle et effort configurables : aucun identifiant de modèle n'est figé dans le code métier
      model: env.ANTHROPIC_MODEL || 'claude-opus-5-5',
      effort: env.ANTHROPIC_EFFORT || 'medium',
      maxTokens: int(env.ANTHROPIC_MAX_TOKENS, 16000),
      fallbacks: (env.ANTHROPIC_FALLBACKS || 'default') !== 'off',
      webSearch: bool(env.WEB_SEARCH, true),
      webSearchTool: env.WEB_SEARCH_TOOL || 'web_search_20260209',
      webFetchTool: env.WEB_FETCH_TOOL || 'web_fetch_20260209',
      webSearchMaxUses: int(env.WEB_SEARCH_MAX_USES, 5),
      hasCredentials: hasAnthropicCredentials
    },
    openai: { model: env.OPENAI_MODEL || '', hasCredentials: !!env.OPENAI_API_KEY },
    accessToken: env.APP_ACCESS_TOKEN || '',
    allowedOrigins: (env.ALLOWED_ORIGINS || 'https://lucas-66126.github.io').split(',').map(function (s) { return s.trim(); }).filter(Boolean),
    dataDir: path.resolve(env.DATA_DIR || path.join(__dirname, '..', 'data')),
    maxUploadMb: int(env.MAX_UPLOAD_MB, 25),
    serveStatic: bool(env.SERVE_STATIC, true),
    maxIterations: int(env.AGENT_MAX_ITERATIONS, 14)
  };
}

module.exports = { loadConfig, loadEnvFile };
