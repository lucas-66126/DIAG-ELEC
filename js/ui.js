/* DIAG-MAINT — composants d'interface partagés : modales, confirmations, toasts, photos. */
(function (DM) {
  'use strict';
  const esc = DM.esc, icon = DM.icon;
  const ui = DM.ui = {};

  function formData(form) {
    const o = {};
    new FormData(form).forEach(function (v, k) {
      if (Object.prototype.hasOwnProperty.call(o, k)) o[k] = [].concat(o[k], v); else o[k] = v;
    });
    return o;
  }
  ui.formData = formData;

  /**
   * Fenêtre modale (bottom-sheet sur mobile).
   * opts: { title, icon, tone: 'danger'|'warning', body (html), actions: [{label, value, cls, submit}],
   *         validate(data, form) -> message d'erreur | null, onOpen(modalEl, form) }
   * Résout { value, data } ou null (annulation).
   */
  ui.modal = function (opts) {
    return new Promise(function (resolve) {
      const root = document.getElementById('modal-root');
      const wrap = document.createElement('div');
      wrap.className = 'modal-backdrop';
      const actions = opts.actions || [{ label: 'Fermer', value: null, cls: 'btn--ghost' }];
      wrap.innerHTML =
        '<div class="modal' + (opts.tone ? ' modal--' + opts.tone : '') + '" role="dialog" aria-modal="true" aria-labelledby="modal-title-' + root.children.length + '">' +
        '<form class="modal__form" novalidate>' +
        '<header class="modal__head"><h2 id="modal-title-' + root.children.length + '">' + (opts.icon ? icon(opts.icon) : '') + '<span>' + esc(opts.title) + '</span></h2>' +
        '<button type="button" class="btn btn--icon btn--flat" data-close aria-label="Fermer">' + icon('x') + '</button></header>' +
        '<div class="modal__body"><div class="modal__error" role="alert" hidden></div>' + (opts.body || '') + '</div>' +
        '<footer class="modal__foot">' + actions.map(function (a, i) {
          return '<button type="' + (a.submit ? 'submit' : 'button') + '" class="btn ' + (a.cls || '') + '" data-i="' + i + '">' + a.label + '</button>';
        }).join('') + '</footer></form></div>';
      root.appendChild(wrap);
      document.body.classList.add('no-scroll');
      const form = wrap.querySelector('form');
      const errBox = wrap.querySelector('.modal__error');
      const prevFocus = document.activeElement;

      function close(val) {
        wrap.remove();
        document.removeEventListener('keydown', onKey);
        if (!root.children.length) document.body.classList.remove('no-scroll');
        if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
        resolve(val);
      }
      function showError(msg) {
        errBox.textContent = msg; errBox.hidden = false;
        errBox.scrollIntoView({ block: 'nearest' });
      }
      function onKey(e) { if (e.key === 'Escape' && root.lastElementChild === wrap) close(null); }
      document.addEventListener('keydown', onKey);

      wrap.addEventListener('mousedown', function (e) { wrap._downOnBackdrop = e.target === wrap; });
      wrap.addEventListener('click', function (e) {
        if ((e.target === wrap && wrap._downOnBackdrop) || e.target.closest('[data-close]')) return close(null);
        const b = e.target.closest('button[data-i]');
        if (!b || b.type === 'submit') return;
        const a = actions[+b.dataset.i];
        if (a.value === null || a.value === undefined) return close(null);
        close({ value: a.value, data: formData(form) });
      });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const b = e.submitter && e.submitter.dataset.i != null ? actions[+e.submitter.dataset.i] : actions.find(function (a) { return a.submit; });
        if (!form.checkValidity()) { form.reportValidity(); return; }
        const data = formData(form);
        if (opts.validate) {
          const err = opts.validate(data, form, b && b.value);
          if (err) return showError(err);
        }
        close({ value: b ? b.value : 'ok', data: data });
      });

      if (opts.onOpen) opts.onOpen(wrap.querySelector('.modal'), form, showError);
      const first = form.querySelector('.modal__body input:not([type=hidden]):not([type=radio]):not([type=checkbox]), .modal__body textarea, .modal__body select');
      const modalEl = wrap.querySelector('.modal');
      modalEl.setAttribute('tabindex', '-1');
      // sur mobile, on évite d'ouvrir le clavier d'office
      if (first && !opts.noAutofocus && window.matchMedia('(pointer: fine)').matches) first.focus();
      else modalEl.focus({ preventScroll: true });
    });
  };

  ui.confirm = function (message, o) {
    o = o || {};
    return ui.modal({
      title: o.title || 'Confirmation',
      icon: o.danger ? 'alert' : 'info',
      tone: o.danger ? 'danger' : null,
      body: '<p>' + esc(message) + '</p>' + (o.detail ? '<p class="muted small">' + esc(o.detail) + '</p>' : ''),
      actions: [
        { label: 'Annuler', value: null, cls: 'btn--ghost' },
        { label: o.okLabel || 'Confirmer', value: 'ok', cls: o.danger ? 'btn--danger' : 'btn--primary' }
      ]
    }).then(function (r) { return !!r; });
  };

  ui.toast = function (msg, type) {
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = 'toast toast--' + (type || 'info');
    el.innerHTML = icon(type === 'error' ? 'alert' : type === 'success' ? 'check' : 'info') + '<span>' + esc(msg) + '</span>';
    root.appendChild(el);
    setTimeout(function () { el.classList.add('toast--out'); }, type === 'error' ? 4500 : 2600);
    setTimeout(function () { el.remove(); }, type === 'error' ? 5000 : 3100);
  };

  /** Bloc de consignes de sécurité. */
  ui.safetyBlock = function (s, withChecks) {
    if (!s || !s.level) return '';
    return '<div class="safety safety--' + s.level + '">' +
      '<div class="safety__title">' + icon(s.level === 'danger' ? 'bolt' : 'alert') + '<strong>' + esc(s.title) + '</strong></div>' +
      '<ul class="safety__list">' + s.points.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' +
      (withChecks ? s.confirmations.map(function (c, i) {
        return '<label class="check"><input type="checkbox" name="ack' + i + '" required><span>' + esc(c) + '</span></label>';
      }).join('') : '') +
      '</div>';
  };

  ui.chip = function (label, cls, ic) {
    return '<span class="chip chip--' + cls + '">' + (ic ? icon(ic) : '') + esc(label) + '</span>';
  };
  ui.typeBadge = function (type) {
    const T = DM.CONTROL_TYPES[type] || DM.CONTROL_TYPES.visuel;
    return '<span class="badge badge--' + T.cls + '">' + icon(T.icon) + T.short + '</span>';
  };

  /* ---------- Photos ---------- */

  /** Galerie + boutons d'ajout. `photos` = [{id, caption}] */
  ui.photoGallery = function (photos, opts) {
    opts = opts || {};
    const list = photos || [];
    return '<div class="photos" data-photos>' +
      (list.length ? '<div class="photo-grid">' + list.map(function (p) {
        return '<button type="button" class="photo-thumb" data-action="photo-view" data-photo="' + esc(p.id) + '" aria-label="Voir la photo' + (p.caption ? ' : ' + esc(p.caption) : '') + '">' +
          '<img data-photo-id="' + esc(p.id) + '" alt="' + esc(p.caption || 'Photo') + '"></button>';
      }).join('') + '</div>' : '<p class="muted small">Aucune photo.</p>') +
      (opts.readonly ? '' :
        '<div class="btnrow">' +
        '<label class="btn btn--ghost">' + icon('camera') + 'Prendre une photo<input type="file" accept="image/*" capture="environment" data-photo-input hidden></label>' +
        '<label class="btn btn--ghost">' + icon('image') + 'Galerie<input type="file" accept="image/*" multiple data-photo-input hidden></label>' +
        '</div>') +
      '</div>';
  };

  /** Charge les images des vignettes présentes dans `root`. */
  ui.hydratePhotos = function (root) {
    root.querySelectorAll('img[data-photo-id]').forEach(function (img) {
      DM.photos.url(img.dataset.photoId).then(function (u) {
        if (u) img.src = u; else img.closest('.photo-thumb') && img.closest('.photo-thumb').classList.add('photo-thumb--missing');
      }).catch(function () {});
    });
  };

  /** Branche les champs d'ajout de photos. onAdded(ids[]) est appelé après stockage. */
  ui.bindPhotoInputs = function (root, diagId, onAdded) {
    root.querySelectorAll('input[data-photo-input]').forEach(function (input) {
      input.addEventListener('change', function () {
        const files = Array.prototype.slice.call(input.files || []);
        input.value = '';
        if (!files.length) return;
        ui.toast(files.length > 1 ? 'Traitement de ' + files.length + ' photos…' : 'Traitement de la photo…');
        Promise.all(files.map(function (f) { return DM.photos.add(diagId, f); }))
          .then(function (ids) { onAdded(ids); ui.toast(DM.plural(ids.length, 'photo ajoutée', 'photos ajoutées'), 'success'); })
          .catch(function (e) { ui.toast(e.message || 'Ajout de la photo impossible.', 'error'); });
      });
    });
  };

  /** Visionneuse ; résout 'delete' ou {caption} ou null. */
  ui.viewPhoto = function (photo, readonly) {
    return DM.photos.url(photo.id).then(function (u) {
      return ui.modal({
        title: 'Photo', icon: 'image',
        body: '<div class="photo-full">' + (u ? '<img src="' + esc(u) + '" alt="' + esc(photo.caption || 'Photo') + '">' : '<p class="muted">Photo introuvable.</p>') + '</div>' +
          (readonly ? (photo.caption ? '<p>' + esc(photo.caption) + '</p>' : '') :
            '<div class="field"><label for="ph-cap">Légende</label><input id="ph-cap" name="caption" value="' + esc(photo.caption || '') + '" placeholder="Ex. plaque signalétique, bornier X1…"></div>'),
        noAutofocus: true,
        actions: readonly ? [{ label: 'Fermer', value: null, cls: 'btn--ghost' }] : [
          { label: icon('trash') + 'Supprimer', value: 'delete', cls: 'btn--danger-ghost' },
          { label: 'Enregistrer', value: 'save', cls: 'btn--primary', submit: true }
        ]
      });
    }).then(function (r) {
      if (!r) return null;
      if (r.value === 'delete') return 'delete';
      return { caption: String(r.data.caption || '').trim() };
    });
  };
})(window.DM);
