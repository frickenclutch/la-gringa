// Owner edit mode for the manuscript (/menu?edit=1, loaded by menu-live.js).
// Tap a glowing item -> edit its name/description/prices in a bottom sheet ->
// PUT the overrides doc -> the page (and every guest load) reflects it.
(function () {
  'use strict';

  var live = window.DGMenuLive;
  if (!live) return;

  var FIELD_LABELS = {
    price: 'Price',
    regular: 'Regular',
    loaded: 'Loaded',
    p1: 'First column',
    p2: 'Second column',
  };

  var sheet, sheetTitle, sheetFields, sheetError, toastEl;
  var activeId = null;

  async function api(path, options) {
    var res = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      ...(options || {}),
    });
    var data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (!res.ok) {
      var staticHost = res.status === 404 || res.status === 405;
      var err = new Error(
        (data && data.error) ||
          (staticHost
            ? 'Editing doesn’t run on this address — use the main site.'
            : 'Request failed (HTTP ' + res.status + ')')
      );
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function injectStyles() {
    var css =
      '.mlive-editable{outline:2px dashed rgba(201,162,39,.85);outline-offset:2px;cursor:pointer;border-radius:2px;' +
      'transition:outline-color .15s ease, background-color .15s ease}' +
      '.mlive-editable:hover{outline-color:#f7d070;background:rgba(247,208,112,.12)}' +
      '.mlive-bar{position:fixed;top:0;left:0;right:0;z-index:13000;display:flex;align-items:center;gap:.6rem;' +
      'padding:.5rem max(.75rem,env(safe-area-inset-right)) .5rem max(.75rem,env(safe-area-inset-left));' +
      'background:linear-gradient(160deg,#2a1b12,#1a100a);color:#f7d070;font-family:Cinzel,serif;font-weight:800;' +
      'font-size:.72rem;letter-spacing:.05em;text-transform:uppercase;box-shadow:0 6px 18px rgba(0,0,0,.45)}' +
      '.mlive-bar .mlive-done{margin-left:auto;appearance:none;border:1.5px solid #c9a227;border-radius:999px;' +
      'background:linear-gradient(160deg,#f7d070,#c9a227);color:#2a1b12;font:inherit;padding:.4rem .9rem;cursor:pointer}' +
      'body.mlive-on{padding-top:2.6rem}' +
      '.mlive-sheet{position:fixed;left:0;right:0;bottom:0;z-index:13001;background:#f6ecd4;color:#1f160f;' +
      'border-top:3px solid #c9a227;border-radius:1rem 1rem 0 0;box-shadow:0 -12px 34px rgba(0,0,0,.45);' +
      'padding:1rem max(1rem,env(safe-area-inset-right)) max(1rem,env(safe-area-inset-bottom)) max(1rem,env(safe-area-inset-left));' +
      'max-height:72vh;overflow:auto;font-family:"IM Fell English",Georgia,serif}' +
      '.mlive-sheet[hidden]{display:none}' +
      '.mlive-sheet h3{margin:0 0 .6rem;font-family:Cinzel,serif;font-size:.95rem;letter-spacing:.04em}' +
      '.mlive-sheet label{display:grid;gap:.25rem;margin-bottom:.65rem;font-family:Cinzel,serif;' +
      'font-size:.68rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase}' +
      '.mlive-sheet input,.mlive-sheet textarea{font:1rem/1.4 "IM Fell English",Georgia,serif;color:inherit;width:100%;' +
      'border:1.5px solid rgba(31,22,15,.35);border-radius:.6rem;background:rgba(255,255,255,.7);padding:.6rem .7rem}' +
      '.mlive-sheet textarea{min-height:5rem;resize:vertical}' +
      '.mlive-actions{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.35rem}' +
      '.mlive-actions button{appearance:none;font-family:Cinzel,serif;font-weight:800;font-size:.7rem;' +
      'letter-spacing:.05em;text-transform:uppercase;border-radius:999px;padding:.6rem 1rem;cursor:pointer;' +
      'border:1.5px solid #3a2a14;background:linear-gradient(160deg,#f0d38a,#b8892d);color:#1f160f}' +
      '.mlive-actions .ghost{background:transparent}' +
      '.mlive-actions .danger{background:#f3d6d0;border-color:#7a1f1f;color:#7a1f1f}' +
      '.mlive-error{color:#7a1f1f;min-height:1.1rem;margin:.35rem 0 0;font-size:.9rem}' +
      '.mlive-hint{opacity:.7;font-size:.85rem;margin:0 0 .6rem}' +
      '.mlive-toast{position:fixed;bottom:max(1rem,env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);' +
      'z-index:13002;background:#1c2a22;color:#f4f1e6;padding:.6rem 1rem;border-radius:999px;font-family:Cinzel,serif;' +
      'font-size:.72rem;letter-spacing:.05em;box-shadow:0 8px 22px rgba(0,0,0,.4);opacity:0;transition:opacity .25s ease}' +
      '.mlive-toast.show{opacity:1}';
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function buildChrome() {
    var bar = document.createElement('div');
    bar.className = 'mlive-bar';
    bar.innerHTML =
      '<span>&#9999;&#65039; Editing the menu &mdash; tap any glowing item</span>' +
      '<button type="button" class="mlive-done">Done</button>';
    bar.querySelector('.mlive-done').addEventListener('click', function () {
      window.location.href = '/owner';
    });
    bar.addEventListener('pointerdown', function (e) {
      e.stopPropagation();
    });
    document.body.appendChild(bar);
    document.body.classList.add('mlive-on');

    sheet = document.createElement('div');
    sheet.className = 'mlive-sheet';
    sheet.hidden = true;
    sheet.innerHTML =
      '<h3 id="mlive-title"></h3>' +
      '<p class="mlive-hint" id="mlive-hint"></p>' +
      '<div id="mlive-fields"></div>' +
      '<div class="mlive-actions">' +
      '<button type="button" id="mlive-save">Save &mdash; goes live</button>' +
      '<button type="button" class="danger" id="mlive-reset">Reset to original</button>' +
      '<button type="button" class="ghost" id="mlive-cancel">Cancel</button>' +
      '</div>' +
      '<p class="mlive-error" id="mlive-errmsg"></p>';
    sheet.addEventListener('pointerdown', function (e) {
      e.stopPropagation();
    });
    document.body.appendChild(sheet);
    sheetTitle = sheet.querySelector('#mlive-title');
    sheetFields = sheet.querySelector('#mlive-fields');
    sheetError = sheet.querySelector('#mlive-errmsg');
    sheet.querySelector('#mlive-cancel').addEventListener('click', closeSheet);
    sheet.querySelector('#mlive-save').addEventListener('click', saveActive);
    sheet.querySelector('#mlive-reset').addEventListener('click', resetActive);

    toastEl = document.createElement('div');
    toastEl.className = 'mlive-toast';
    document.body.appendChild(toastEl);
  }

  var toastTimer = null;
  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastEl.classList.remove('show');
    }, 2200);
  }

  function markEditables() {
    var map = live.getMap();
    Object.keys(map).forEach(function (id) {
      var m = map[id];
      Object.keys(m).forEach(function (field) {
        var el = m[field];
        el.classList.add('mlive-editable');
        el.addEventListener('pointerdown', function (e) {
          e.stopPropagation();
        });
        el.addEventListener('click', function (e) {
          e.stopPropagation();
          e.preventDefault();
          openSheet(id);
        });
      });
    });
  }

  function fieldRow(labelText, inputId, value, placeholder, isTextarea) {
    var wrap = document.createElement('label');
    wrap.textContent = labelText;
    var input = document.createElement(isTextarea ? 'textarea' : 'input');
    input.id = inputId;
    input.value = value;
    if (placeholder) input.placeholder = placeholder;
    wrap.appendChild(input);
    return wrap;
  }

  function openSheet(id) {
    var map = live.getMap();
    var base = live.getBase();
    var m = map[id];
    if (!m) return;
    activeId = id;
    var lang = live.currentLang();
    sheetError.textContent = '';
    sheetTitle.textContent = m.name ? m.name.textContent : id.split('.').pop();
    var langName = { en: 'English', es: 'Español', fr: 'Français' }[lang] || lang;
    sheet.querySelector('#mlive-hint').textContent =
      (m.name || m.desc
        ? 'Editing ' + langName + ' — the other languages are translated for you on save, until you customize them yourself (flip EN | ES | FR). '
        : '') + 'Leave a field matching the original to un-override it.';
    sheetFields.innerHTML = '';
    if (m.name) {
      sheetFields.appendChild(
        fieldRow('Name (' + lang.toUpperCase() + ')', 'mlive-f-name', m.name.textContent, base[id].name, false)
      );
    }
    if (m.desc) {
      sheetFields.appendChild(
        fieldRow('Description (' + lang.toUpperCase() + ')', 'mlive-f-desc', m.desc.textContent, base[id].desc, true)
      );
    }
    live.PRICE_FIELDS.forEach(function (f) {
      if (!m[f]) return;
      sheetFields.appendChild(
        fieldRow(FIELD_LABELS[f] || f, 'mlive-f-' + f, m[f].textContent, base[id][f], false)
      );
    });
    sheet.hidden = false;
  }

  function closeSheet() {
    sheet.hidden = true;
    activeId = null;
  }

  function collectEntry(id) {
    var map = live.getMap();
    var base = live.getBase();
    var overrides = live.getOverrides();
    var m = map[id];
    var lang = live.currentLang();
    var existing = (overrides.items && overrides.items[id]) || {};
    var entry = { ...existing };

    function setOrClear(field, value, baseValue) {
      var v = String(value == null ? '' : value).trim();
      if (!v || v === String(baseValue == null ? '' : baseValue).trim()) {
        delete entry[field];
      } else {
        entry[field] = v;
      }
    }

    if (m.name) {
      var nameInput = sheet.querySelector('#mlive-f-name');
      // Base for the active language: EN base is the printed text; ES base is the dictionary text.
      setOrClear('name_' + lang, nameInput.value, lang === 'en' ? base[id].name : baseLangText(m.name));
    }
    if (m.desc) {
      var descInput = sheet.querySelector('#mlive-f-desc');
      setOrClear('desc_' + lang, descInput.value, lang === 'en' ? base[id].desc : baseLangText(m.desc));
    }
    live.PRICE_FIELDS.forEach(function (f) {
      if (!m[f]) return;
      setOrClear(f, sheet.querySelector('#mlive-f-' + f).value, base[id][f]);
    });
    return entry;
  }

  // For ES resets we need the dictionary text: re-run i18n on a detached clone.
  function baseLangText(el) {
    try {
      var key = el.getAttribute('data-i18n');
      var dict = window.DGLang && window.DGLang.dict && window.DGLang.dict();
      var lang = live.currentLang();
      if (dict && dict[lang] && key && dict[lang][key]) return dict[lang][key];
    } catch (e) {
      /* fall through */
    }
    return null;
  }

  async function putOverrides(items) {
    var data = await api('/api/owner/menu', {
      method: 'PUT',
      body: JSON.stringify({ items: items }),
    });
    live.setOverrides(data.overrides || { items: items });
    return data;
  }

  function restoreBaseDom(id) {
    var map = live.getMap();
    var base = live.getBase();
    var m = map[id];
    live.PRICE_FIELDS.forEach(function (f) {
      if (m[f] && base[id][f] != null) m[f].textContent = base[id][f];
    });
    if (window.DGLang && typeof window.DGLang.apply === 'function') window.DGLang.apply();
  }

  async function saveActive() {
    if (!activeId) return;
    sheetError.textContent = '';
    var overrides = live.getOverrides();
    var items = { ...(overrides.items || {}) };
    var entry = collectEntry(activeId);
    if (Object.keys(entry).length) {
      items[activeId] = entry;
    } else {
      delete items[activeId];
    }
    try {
      var data = await putOverrides(items);
      restoreBaseDom(activeId);
      live.applyAll();
      var didTranslate = data && Array.isArray(data.translated) && data.translated.length;
      toast(
        didTranslate
          ? 'Saved — other languages translated automatically'
          : 'Saved — guests see it now'
      );
      closeSheet();
    } catch (error) {
      if (error.status === 401) {
        window.location.href = '/owner';
        return;
      }
      sheetError.textContent = error.message || 'Save failed';
    }
  }

  async function resetActive() {
    if (!activeId) return;
    sheetError.textContent = '';
    var overrides = live.getOverrides();
    var items = { ...(overrides.items || {}) };
    delete items[activeId];
    try {
      await putOverrides(items);
      restoreBaseDom(activeId);
      live.applyAll();
      toast('Back to the printed original');
      closeSheet();
    } catch (error) {
      if (error.status === 401) {
        window.location.href = '/owner';
        return;
      }
      sheetError.textContent = error.message || 'Reset failed';
    }
  }

  async function boot() {
    try {
      // Auth probe: must be a real board payload. Static mirrors answer API
      // paths with HTML (parsed to null) — that's not an owner session.
      var probe = await api('/api/owner/board');
      if (!probe || !probe.month) throw new Error('no worker on this host');
    } catch (error) {
      window.location.href = '/owner';
      return;
    }
    try {
      var data = await api('/api/menu-overrides');
      if (data && data.items) live.setOverrides(data);
    } catch (e) {
      /* keep whatever menu-live fetched */
    }
    injectStyles();
    buildChrome();
    markEditables();
    toast('Edit mode — tap a glowing item');
  }

  boot();
})();
