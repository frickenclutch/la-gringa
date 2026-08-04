// Dirty Gringo — language passport + EN/ES chrome
(function () {
  'use strict';

  var STORAGE_KEY = 'dg-lang';
  var dict = null;
  var ready = false;

  var LANGS = ['en', 'es', 'fr'];

  var FALLBACK = {
    en: {
      'passport.eyebrow': 'Crossing the river · St. Lawrence border',
      'passport.title': '¿Español, English,\nou Français?',
      'passport.sub': 'Pick your tongue. Stamp your passport. Enter the patio.',
      'passport.es': 'Español',
      'passport.esHint': 'Mi amigo',
      'passport.en': 'English',
      'passport.enHint': 'My friend',
      'passport.fr': 'Français',
      'passport.frHint': 'Mon ami',
      'passport.toggle': 'Language',
    },
    es: {
      'passport.eyebrow': 'Cruzando el río · frontera del San Lorenzo',
      'passport.title': '¿Español, English,\nou Français?',
      'passport.sub': 'Elige tu lengua. Sella tu pasaporte. Entra al patio.',
      'passport.es': 'Español',
      'passport.esHint': 'Mi amigo',
      'passport.en': 'English',
      'passport.enHint': 'My friend',
      'passport.fr': 'Français',
      'passport.frHint': 'Mon ami',
      'passport.toggle': 'Idioma',
    },
    fr: {
      'passport.eyebrow': 'Traversée du fleuve · frontière du Saint-Laurent',
      'passport.title': '¿Español, English,\nou Français?',
      'passport.sub': 'Choisis ta langue. Tamponne ton passeport. Entre sur le patio.',
      'passport.es': 'Español',
      'passport.esHint': 'Mi amigo',
      'passport.en': 'English',
      'passport.enHint': 'My friend',
      'passport.fr': 'Français',
      'passport.frHint': 'Mon ami',
      'passport.toggle': 'Langue',
    },
  };

  function pageKind() {
    var path = (location.pathname || '').replace(/\/+$/, '') || '/';
    if (path === '/' || path.endsWith('/index') || path.endsWith('index.html')) return 'gate';
    if (path.endsWith('/hub') || path.endsWith('hub.html')) return 'hub';
    if (path.endsWith('/menu') || path.endsWith('menu.html')) return 'menu';
    if (path.endsWith('/owner') || path.endsWith('owner.html')) return 'owner';
    return 'other';
  }

  function getLang() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (LANGS.indexOf(stored) !== -1) return stored;
    } catch (e) {}
    return null;
  }

  function setLang(lang) {
    if (LANGS.indexOf(lang) === -1) return;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {}
    document.documentElement.lang = lang;
    document.documentElement.dataset.lang = lang;
    applyStrings();
    syncToggle();
    document.dispatchEvent(new CustomEvent('dg:lang', { detail: { lang: lang } }));
  }

  function t(key) {
    var lang = getLang() || 'en';
    var pack = (dict && dict[lang]) || FALLBACK[lang] || FALLBACK.en;
    if (pack[key] != null) return pack[key];
    if (FALLBACK[lang] && FALLBACK[lang][key] != null) return FALLBACK[lang][key];
    if (dict && dict.en && dict.en[key] != null) return dict.en[key];
    return FALLBACK.en[key] || key;
  }

  function applyStrings() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (!key) return;
      var value = t(key);
      if (el.hasAttribute('data-i18n-html')) el.innerHTML = value.replace(/\n/g, '<br>');
      else el.textContent = value;
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-aria');
      if (key) el.setAttribute('aria-label', t(key));
    });
  }

  function injectStyles() {
    if (document.getElementById('dg-i18n-styles')) return;
    var style = document.createElement('style');
    style.id = 'dg-i18n-styles';
    style.textContent =
      '.lang-passport{position:fixed;inset:0;z-index:12000;display:flex;align-items:center;justify-content:center;' +
      'padding:max(1rem,env(safe-area-inset-top)) max(1rem,env(safe-area-inset-right)) max(1rem,env(safe-area-inset-bottom)) max(1rem,env(safe-area-inset-left));' +
      'background:radial-gradient(ellipse at 50% 30%,rgba(199,0,57,.35),transparent 55%),' +
      'radial-gradient(ellipse at 70% 80%,rgba(245,159,0,.18),transparent 45%),#0a0612;}' +
      '.lang-passport[hidden]{display:none!important}' +
      '.lang-passport-stage{width:min(420px,100%);text-align:center;color:#fff6e8;' +
      'animation:lang-rise .55s cubic-bezier(.2,.9,.3,1) both}' +
      '@keyframes lang-rise{from{opacity:0;transform:translateY(18px) scale(.96)}to{opacity:1;transform:none}}' +
      '.lang-passport-eyebrow{margin:0 0 .85rem;font-family:Cinzel,Rye,serif;font-size:.72rem;letter-spacing:.14em;' +
      'text-transform:uppercase;color:#f7d070;opacity:.9}' +
      '.lang-passport-seal{position:relative;width:9.5rem;height:9.5rem;margin:0 auto 1.1rem}' +
      '.lang-passport-seal img{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 12px 28px rgba(0,0,0,.55));' +
      'border-radius:50%}' +
      '.lang-stamp{position:absolute;inset:18%;display:flex;align-items:center;justify-content:center;' +
      'border:3px solid #c92a2a;border-radius:50%;color:#c92a2a;font-family:Cinzel,Rye,serif;font-weight:800;' +
      'font-size:1.35rem;letter-spacing:.12em;text-transform:uppercase;opacity:0;transform:scale(1.6) rotate(-18deg);' +
      'pointer-events:none;mix-blend-mode:multiply;background:rgba(201,42,42,.08)}' +
      '.lang-stamp.is-stamping{animation:lang-stamp-slam .7s cubic-bezier(.15,1.4,.3,1) forwards}' +
      '@keyframes lang-stamp-slam{0%{opacity:0;transform:scale(1.7) rotate(-22deg)}' +
      '55%{opacity:1;transform:scale(.92) rotate(-8deg)}100%{opacity:.92;transform:scale(1) rotate(-10deg)}}' +
      '.lang-passport-title{margin:0 0 .55rem;font-family:Rye,Cinzel,serif;font-size:clamp(1.55rem,6vw,2.15rem);' +
      'line-height:1.15;color:#f7d070;text-shadow:0 2px 0 rgba(0,0,0,.35)}' +
      '.lang-passport-sub{margin:0 auto 1.35rem;max-width:22rem;font-family:"IM Fell English",Georgia,serif;' +
      'font-size:.98rem;line-height:1.4;color:rgba(255,246,232,.78)}' +
      '.lang-skillets{display:grid;grid-template-columns:repeat(3,1fr);gap:.55rem}' +
      '@media (max-width:380px){.lang-skillet{padding:.8rem .4rem .7rem}' +
      '.lang-skillet-pan{width:2.5rem;height:2.5rem}.lang-skillet-label{font-size:.95rem}}' +
      '.lang-skillet{appearance:none;border:2px solid #4a3600;border-radius:1rem;padding:1rem .7rem .9rem;' +
      'background:linear-gradient(165deg,#2a1b12 0%,#1a100a 55%,#0d0906 100%);color:#fff6e8;cursor:pointer;' +
      'box-shadow:0 10px 28px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.08);transition:transform .15s ease,filter .15s ease;' +
      '-webkit-tap-highlight-color:transparent}' +
      '.lang-skillet:hover{filter:brightness(1.08);transform:translateY(-2px)}' +
      '.lang-skillet:active{transform:scale(.97)}' +
      '.lang-skillet-pan{display:block;width:3.1rem;height:3.1rem;margin:0 auto .55rem;border-radius:50%;' +
      'border:3px solid #c9a227;background:radial-gradient(circle at 35% 30%,#5a3a12,#1a1008 70%);' +
      'box-shadow:inset 0 0 0 2px rgba(0,0,0,.45),0 0 16px rgba(245,159,0,.25);position:relative}' +
      '.lang-skillet-pan::after{content:"";position:absolute;right:-.55rem;top:42%;width:1rem;height:.35rem;' +
      'background:#c9a227;border-radius:999px;transform:rotate(12deg)}' +
      '.lang-skillet-label{display:block;font-family:Lilita One,Cinzel,cursive;font-size:1.15rem;letter-spacing:.04em}' +
      '.lang-skillet-hint{display:block;margin-top:.2rem;font-family:"IM Fell English",Georgia,serif;font-size:.8rem;' +
      'opacity:.7;font-style:italic}' +
      '.lang-skillet[data-lang="es"]{border-color:#087f5b}' +
      '.lang-skillet[data-lang="en"]{border-color:#c92a2a}' +
      '.lang-skillet[data-lang="fr"]{border-color:#1d5fbf}' +
      'body.lang-passport-open{overflow:hidden}' +
      '.lang-toggle{position:fixed;bottom:max(16px,env(safe-area-inset-bottom));left:max(16px,env(safe-area-inset-left));' +
      'z-index:10050;display:inline-flex;align-items:center;gap:0;padding:0;border:1.5px solid #4a3600;' +
      'border-radius:999px;overflow:hidden;background:rgba(20,12,8,.82);box-shadow:0 8px 22px rgba(0,0,0,.4);' +
      'font-family:Cinzel,serif;font-size:.68rem;font-weight:800;letter-spacing:.08em;-webkit-tap-highlight-color:transparent}' +
      '.lang-toggle button{appearance:none;border:0;background:transparent;color:rgba(255,246,232,.55);' +
      'padding:.45rem .65rem;cursor:pointer;font:inherit;letter-spacing:inherit}' +
      '.lang-toggle button.is-active{background:linear-gradient(160deg,#f7d070,#c9a227);color:#2a1b12}' +
      'html[data-menu-layout] .lang-toggle{top:max(12px,env(safe-area-inset-top));left:max(12px,env(safe-area-inset-left));bottom:auto;right:auto}' +
      'body.street-board-open .lang-toggle,body.lang-passport-open .lang-toggle,body.install-coach-open .lang-toggle{opacity:0;pointer-events:none}' +
      'html[data-perf="lite"] .lang-stamp.is-stamping{animation:none;opacity:.92;transform:scale(1) rotate(-10deg)}' +
      '@media (prefers-reduced-motion:reduce){.lang-passport-stage,.lang-stamp.is-stamping{animation:none!important}}';
    document.head.appendChild(style);
  }

  function ensurePassport() {
    if (document.getElementById('lang-passport')) return document.getElementById('lang-passport');
    var root = document.createElement('div');
    root.id = 'lang-passport';
    root.className = 'lang-passport';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'lang-passport-title');
    root.innerHTML =
      '<div class="lang-passport-stage">' +
      '<p class="lang-passport-eyebrow" data-i18n="passport.eyebrow"></p>' +
      '<div class="lang-passport-seal">' +
      '<img src="/icons/icon-192.png" alt="" width="152" height="152" decoding="async" />' +
      '<div class="lang-stamp" id="lang-stamp" aria-hidden="true"></div>' +
      '</div>' +
      '<h1 id="lang-passport-title" class="lang-passport-title" data-i18n="passport.title" data-i18n-html></h1>' +
      '<p class="lang-passport-sub" data-i18n="passport.sub"></p>' +
      '<div class="lang-skillets">' +
      '<button type="button" class="lang-skillet" data-lang="es" aria-label="Español">' +
      '<span class="lang-skillet-pan" aria-hidden="true"></span>' +
      '<span class="lang-skillet-label" data-i18n="passport.es"></span>' +
      '<span class="lang-skillet-hint" data-i18n="passport.esHint"></span>' +
      '</button>' +
      '<button type="button" class="lang-skillet" data-lang="en" aria-label="English">' +
      '<span class="lang-skillet-pan" aria-hidden="true"></span>' +
      '<span class="lang-skillet-label" data-i18n="passport.en"></span>' +
      '<span class="lang-skillet-hint" data-i18n="passport.enHint"></span>' +
      '</button>' +
      '<button type="button" class="lang-skillet" data-lang="fr" aria-label="Français">' +
      '<span class="lang-skillet-pan" aria-hidden="true"></span>' +
      '<span class="lang-skillet-label" data-i18n="passport.fr"></span>' +
      '<span class="lang-skillet-hint" data-i18n="passport.frHint"></span>' +
      '</button>' +
      '</div></div>';
    document.body.appendChild(root);

    root.querySelectorAll('.lang-skillet').forEach(function (btn) {
      btn.addEventListener('click', function () {
        chooseLang(btn.getAttribute('data-lang'));
      });
    });
    return root;
  }

  function ensureToggle() {
    if (document.getElementById('lang-toggle')) return;
    var wrap = document.createElement('div');
    wrap.id = 'lang-toggle';
    wrap.className = 'lang-toggle';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Language');
    wrap.innerHTML =
      '<button type="button" data-set-lang="en" aria-pressed="false">EN</button>' +
      '<button type="button" data-set-lang="es" aria-pressed="false">ES</button>' +
      '<button type="button" data-set-lang="fr" aria-pressed="false">FR</button>';
    document.body.appendChild(wrap);
    wrap.querySelectorAll('button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('data-set-lang');
        if (next === getLang()) return;
        setLang(next);
      });
    });
  }

  function syncToggle() {
    var wrap = document.getElementById('lang-toggle');
    if (!wrap) return;
    var lang = getLang() || 'en';
    wrap.setAttribute('aria-label', t('passport.toggle'));
    wrap.querySelectorAll('button').forEach(function (btn) {
      var active = btn.getAttribute('data-set-lang') === lang;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function showPassport() {
    injectStyles();
    var gate = ensurePassport();
    // Temporary EN pack for the bilingual question itself
    document.documentElement.lang = 'en';
    applyStrings();
    gate.hidden = false;
    document.body.classList.add('lang-passport-open');
    var first = gate.querySelector('.lang-skillet');
    if (first) first.focus();
  }

  function hidePassport() {
    var gate = document.getElementById('lang-passport');
    if (gate) gate.hidden = true;
    document.body.classList.remove('lang-passport-open');
  }

  function chooseLang(lang) {
    var stamp = document.getElementById('lang-stamp');
    var gate = document.getElementById('lang-passport');
    var reduce =
      document.documentElement.dataset.perf === 'lite' ||
      (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    if (stamp) {
      stamp.textContent = lang === 'es' ? 'ES' : 'EN';
      stamp.classList.remove('is-stamping');
      void stamp.offsetWidth;
      stamp.classList.add('is-stamping');
    }

    var wait = reduce ? 120 : 780;
    if (gate) {
      gate.querySelectorAll('.lang-skillet').forEach(function (b) {
        b.disabled = true;
      });
    }

    window.setTimeout(function () {
      setLang(lang);
      hidePassport();
      ensureToggle();
      syncToggle();
    }, wait);
  }

  async function loadDict() {
    try {
      var res = await fetch('/data/i18n.json', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('i18n');
      dict = await res.json();
    } catch (e) {
      dict = { en: Object.assign({}, FALLBACK.en), es: Object.assign({}, FALLBACK.es) };
    }
  }

  async function boot() {
    if (pageKind() === 'owner') return;
    injectStyles();
    await loadDict();
    ready = true;

    var lang = getLang();
    if (!lang) {
      showPassport();
      return;
    }

    setLang(lang);
    ensureToggle();
    syncToggle();
  }

  window.DGLang = {
    get: getLang,
    set: setLang,
    t: t,
    apply: applyStrings,
    ready: function () {
      return ready;
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
