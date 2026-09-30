/* DIAG-MAINT — formulaire de création / modification d'un diagnostic */
(function (DM) {
  'use strict';
  const esc = DM.esc, icon = DM.icon;

  // état du formulaire en cours (photos ajoutées/supprimées avant enregistrement)
  let state = null;

  function chipsHtml(type, current) {
    const have = DM.symptomList({ symptoms: current || '' }).map(DM.normalize);
    return DM.symptomChips(type).map(function (s) {
      const on = have.indexOf(DM.normalize(s)) !== -1;
      return '<button type="button" class="chip-btn' + (on ? ' is-on' : '') + '" data-action="add-symptom" data-text="' + esc(s) + '"' +
        (on ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' + icon(on ? 'check' : 'plus') + esc(s) + '</button>';
    }).join('');
  }

  function field(name, label, value, o) {
    o = o || {};
    const id = 'f-' + name;
    return '<div class="field"><label for="' + id + '">' + label + (o.required ? ' <span class="req">*</span>' : '') + '</label>' +
      (o.textarea
        ? '<textarea id="' + id + '" name="' + name + '" rows="' + (o.rows || 3) + '"' + (o.required ? ' required' : '') + ' placeholder="' + esc(o.placeholder || '') + '">' + esc(value) + '</textarea>'
        : '<input id="' + id + '" name="' + name + '" type="' + (o.type || 'text') + '" value="' + esc(value) + '"' + (o.required ? ' required' : '') +
          ' placeholder="' + esc(o.placeholder || '') + '" autocomplete="off"' + (o.maxlength ? ' maxlength="' + o.maxlength + '"' : '') + '>') +
      (o.hint ? '<p class="hint">' + o.hint + '</p>' : '') + '</div>';
  }

  function renderPhotos(root) {
    const box = root.querySelector('#form-photos');
    box.innerHTML = DM.ui.photoGallery(state.photos);
    DM.ui.hydratePhotos(box);
    DM.ui.bindPhotoInputs(box, state.diagId, function (ids) {
      ids.forEach(function (id) { state.photos.push({ id: id, caption: '', addedAt: new Date().toISOString() }); state.added.push(id); });
      renderPhotos(root);
    });
  }

  DM.views.form = {
    render: function (params) {
      let d = null;
      if (params.id) {
        d = DM.store.get(params.id);
        if (!d) return DM.ui.notFound();
      }
      state = { isNew: !d, diagId: d ? d.id : DM.uid('diag'), photos: d ? DM.clone(d.photos || []) : [], added: [], removed: [], saved: false };
      const v = d || { name: '', installationType: '', brand: '', model: '', reference: '', location: '', description: '', symptoms: '', date: DM.todayISO() };

      const types = DM.INSTALL_TYPES.map(function (t) {
        return '<label class="type-tile"><input type="radio" name="installationType" value="' + t.id + '"' + (v.installationType === t.id ? ' checked' : '') + ' required>' +
          '<span>' + icon(t.icon) + '<b>' + esc(t.label) + '</b></span></label>';
      }).join('');

      return {
        title: state.isNew ? 'Nouveau diagnostic' : 'Modifier le diagnostic',
        back: state.isNew ? '#/' : '#/diag/' + encodeURIComponent(d.id),
        html:
          '<form id="diag-form" class="form" novalidate>' +
            '<div class="notice notice--error" id="form-errors" role="alert" hidden></div>' +
            field('name', 'Nom du diagnostic', v.name, { required: true, maxlength: 120, placeholder: 'Ex. CTA bâtiment B – ventilation à l’arrêt' }) +
            '<fieldset class="field"><legend>Type d’installation <span class="req">*</span></legend><div class="type-grid">' + types + '</div></fieldset>' +
            '<div class="grid2">' + field('brand', 'Marque', v.brand, { placeholder: 'Ex. Schneider' }) + field('model', 'Modèle', v.model, { placeholder: 'Ex. TeSys D' }) + '</div>' +
            '<div class="grid2">' + field('reference', 'Référence / N° de série', v.reference, { placeholder: 'Ex. LC1D25P7' }) + field('location', 'Localisation', v.location, { placeholder: 'Site, bâtiment, local…' }) + '</div>' +
            field('description', 'Description de la panne', v.description, { required: true, textarea: true, rows: 4, placeholder: 'Ce qui est constaté, depuis quand, dans quelles conditions…' }) +
            '<div class="field"><label for="f-symptoms">Symptômes</label>' +
              '<textarea id="f-symptoms" name="symptoms" rows="4" placeholder="Un symptôme par ligne">' + esc(v.symptoms) + '</textarea>' +
              '<p class="hint">Touchez un symptôme courant pour l’ajouter :</p>' +
              '<div class="chips" id="symptom-chips">' + chipsHtml(v.installationType || 'autre', v.symptoms) + '</div></div>' +
            field('date', 'Date', v.date, { type: 'date' }) +
            '<div class="field"><span class="label">' + icon('camera') + 'Photos</span><div id="form-photos"></div></div>' +
            '<div class="form-actions">' +
              '<button type="button" class="btn btn--ghost btn--lg" data-action="cancel">Annuler</button>' +
              '<button type="submit" class="btn btn--primary btn--lg">' + icon('check') + (state.isNew ? 'Créer le diagnostic' : 'Enregistrer') + '</button>' +
            '</div>' +
          '</form>'
      };
    },

    mount: function (root) {
      const form = root.querySelector('#diag-form');
      if (!form) return;
      renderPhotos(root);
      form.addEventListener('change', function (e) {
        if (e.target.name === 'installationType') {
          root.querySelector('#symptom-chips').innerHTML = chipsHtml(e.target.value, form.symptoms.value);
        }
      });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const data = DM.ui.formData(form);
        const errors = DM.validateInfo(data);
        const box = root.querySelector('#form-errors');
        if (errors.length) {
          box.innerHTML = icon('alert') + '<div>' + errors.map(esc).join('<br>') + '</div>';
          box.hidden = false;
          box.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        try {
          let d;
          if (state.isNew) {
            d = DM.createDiagnostic(Object.assign({}, data, { id: state.diagId, photos: state.photos }));
          } else {
            d = DM.store.get(state.diagId);
            DM.updateInfo(d, Object.assign({}, data, { photos: state.photos }));
          }
          DM.store.save(d);
          DM.photos.removeMany(state.removed);
          state.saved = true;
          DM.ui.toast(state.isNew ? 'Diagnostic créé' : 'Modifications enregistrées', 'success');
          DM.app.go('/diag/' + encodeURIComponent(d.id));
        } catch (err) {
          box.innerHTML = icon('alert') + '<div>' + esc(err.message) + '</div>';
          box.hidden = false;
        }
      });
    },

    unmount: function () {
      // photos ajoutées dans un formulaire abandonné : on les supprime
      if (state && !state.saved && state.added.length) DM.photos.removeMany(state.added);
    },

    actions: {
      'add-symptom': function (el) {
        const ta = document.getElementById('f-symptoms');
        const text = el.dataset.text;
        const lines = DM.symptomList({ symptoms: ta.value });
        const i = lines.map(DM.normalize).indexOf(DM.normalize(text));
        if (i === -1) lines.push(text); else lines.splice(i, 1);
        ta.value = lines.join('\n');
        const type = (document.querySelector('input[name=installationType]:checked') || {}).value || 'autre';
        document.getElementById('symptom-chips').innerHTML = chipsHtml(type, ta.value);
      },
      'cancel': function () {
        DM.app.go(state && !state.isNew ? '/diag/' + encodeURIComponent(state.diagId) : '/');
      },
      'photo-view': function (el) {
        const p = state.photos.find(function (x) { return x.id === el.dataset.photo; });
        if (!p) return;
        return DM.ui.viewPhoto(p).then(function (r) {
          if (!r) return;
          if (r === 'delete') {
            state.photos = state.photos.filter(function (x) { return x.id !== p.id; });
            if (state.added.indexOf(p.id) !== -1) {
              state.added = state.added.filter(function (x) { return x !== p.id; });
              DM.photos.remove(p.id);
            } else {
              state.removed.push(p.id); // supprimée réellement à l'enregistrement
            }
          } else {
            p.caption = r.caption;
          }
          renderPhotos(document.getElementById('app'));
        });
      }
    }
  };
})(window.DM);
