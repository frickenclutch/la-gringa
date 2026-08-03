// Live menu overrides: owner edits (names, descriptions, prices) stored in KV
// are patched over the printed manuscript on every load. The static HTML stays
// the no-JS/offline fallback; this only rewrites text in place.
(function () {
  'use strict';

  var API_URL = '/api/menu-overrides';
  var PRICE_FIELDS = ['price', 'regular', 'loaded', 'p1', 'p2'];

  var map = {}; // id -> { name: el, desc: el, price: el, regular: el, ... }
  var base = {}; // id -> { field: original text }
  var overrides = { items: {} };

  function itemKeySuffix(key, kind) {
    // menu.item.tacoSalad.name -> tacoSalad
    var m = key.match(new RegExp('^menu\\.item\\.([A-Za-z0-9]+)\\.' + kind + '$'));
    return m ? m[1] : null;
  }

  function labelSuffix(key) {
    var m = key.match(/^menu\.label\.([A-Za-z0-9]+)$/);
    return m ? m[1] : null;
  }

  function slot(id) {
    if (!map[id]) {
      map[id] = {};
      base[id] = {};
    }
    return map[id];
  }

  function assign(id, field, el) {
    if (!el) return;
    var s = slot(id);
    if (s[field]) return; // first wins; duplicate ids keep the first node
    s[field] = el;
    base[id][field] = el.textContent;
  }

  function buildMap() {
    // 1. Flex dishes: .menu-item blocks keyed by their i18n name/desc hooks.
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n') || '';
      var name = itemKeySuffix(key, 'name');
      if (name) {
        var id = 'item.' + name;
        assign(id, 'name', el);
        var title = el.closest('.menu-item-title');
        if (title) assign(id, 'price', title.querySelector('.price'));
        return;
      }
      var desc = itemKeySuffix(key, 'desc');
      if (desc) assign('item.' + desc, 'desc', el);
    });

    // 2. Scoped tables: single-price rows, the quesadilla matrix, size cells.
    document.querySelectorAll('table[data-msec]').forEach(function (table) {
      var sec = table.getAttribute('data-msec');
      table.querySelectorAll('tr').forEach(function (row) {
        var labelEl = row.querySelector('td[data-i18n]');
        if (!labelEl) return;
        var suffix = labelSuffix(labelEl.getAttribute('data-i18n') || '');
        if (!suffix) return;
        var id = sec + '.' + suffix;
        var priced = Array.prototype.slice.call(row.querySelectorAll('td.price'));
        if (priced.length === 1) {
          assign(id, 'price', priced[0]);
        } else if (priced.length >= 2) {
          assign(id, sec === 'quesadillas' ? 'regular' : 'p1', priced[0]);
          assign(id, sec === 'quesadillas' ? 'loaded' : 'p2', priced[1]);
        } else {
          // No .price cells (salsa sizes): remaining non-empty tds are text slots.
          var cells = Array.prototype.filter.call(row.querySelectorAll('td'), function (td) {
            return td !== labelEl && td.textContent.trim();
          });
          if (cells[0]) assign(id, 'p1', cells[0]);
          if (cells[1]) assign(id, 'p2', cells[1]);
        }
      });
    });

    // 3. Beverage spans: .price next to a menu.label sibling, outside tables/items.
    document.querySelectorAll('span.price').forEach(function (el) {
      if (el.closest('.menu-item') || el.closest('table')) return;
      var parent = el.parentElement;
      var label = parent && parent.querySelector('[data-i18n^="menu.label."]');
      if (!label) return;
      var suffix = labelSuffix(label.getAttribute('data-i18n') || '');
      if (suffix) assign('bev.' + suffix, 'price', el);
    });
  }

  function currentLang() {
    try {
      return (window.DGLang && window.DGLang.get()) || 'en';
    } catch (e) {
      return 'en';
    }
  }

  function applyAll() {
    var lang = currentLang();
    var items = (overrides && overrides.items) || {};
    Object.keys(items).forEach(function (id) {
      var entry = items[id] || {};
      var m = map[id];
      if (!m) return;
      PRICE_FIELDS.forEach(function (f) {
        if (entry[f] && m[f]) m[f].textContent = entry[f];
      });
      if (entry['name_' + lang] && m.name) m.name.textContent = entry['name_' + lang];
      if (entry['desc_' + lang] && m.desc) m.desc.textContent = entry['desc_' + lang];
    });
  }

  async function refresh() {
    try {
      var res = await fetch(API_URL, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('overrides ' + res.status);
      var data = await res.json();
      if (data && typeof data === 'object' && data.items) overrides = data;
      applyAll();
    } catch (e) {
      // Static host or offline: the printed menu stands.
    }
  }

  function boot() {
    buildMap();
    refresh();
    // i18n rewrites name/desc text on every language pass — always re-apply after.
    document.addEventListener('dg:lang', applyAll);

    if (new URLSearchParams(window.location.search).get('edit') === '1') {
      var s = document.createElement('script');
      s.src = '/js/menu-edit.js';
      s.defer = true;
      document.body.appendChild(s);
    }
  }

  window.DGMenuLive = {
    getMap: function () {
      return map;
    },
    getBase: function () {
      return base;
    },
    getOverrides: function () {
      return overrides;
    },
    setOverrides: function (next) {
      if (next && typeof next === 'object' && next.items) overrides = next;
      applyAll();
    },
    applyAll: applyAll,
    refresh: refresh,
    currentLang: currentLang,
    PRICE_FIELDS: PRICE_FIELDS,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
