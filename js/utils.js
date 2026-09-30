/* DIAG-MAINT — utilitaires génériques (sans DOM) */
window.DM = window.DM || {};
(function (DM) {
  'use strict';

  DM.uid = function (prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  DM.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  };
  DM.nl2br = function (s) { return DM.esc(s).replace(/\n/g, '<br>'); };

  /** minuscules, sans accents */
  DM.normalize = function (s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  };
  /** texte normalisé, mots séparés par un espace, encadré d'espaces (pour la recherche de mots-clés) */
  DM.normText = function (s) {
    return ' ' + DM.normalize(s).replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  };
  /** vrai si un mot du texte commence par le mot-clé (le mot-clé peut contenir des espaces) */
  DM.hasKeyword = function (normText, keyword) {
    return normText.indexOf(' ' + keyword) !== -1;
  };

  DM.todayISO = function () {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  };
  DM.fmtDate = function (iso) {
    if (!iso) return '';
    const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };
  DM.fmtDateTime = function (iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  DM.clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  DM.plural = function (n, one, many) { return n + ' ' + (n > 1 ? (many || one + 's') : one); };
})(window.DM);
