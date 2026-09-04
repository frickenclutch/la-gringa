/* The Dirty Gringo — menu ambience (js/menu-ambience.js)
   Cheap atmosphere for the Lost Manuscript. Every loop here is compositor-only
   (transform / opacity on a handful of small elements): nothing tracks the
   pointer and nothing touches the 3D book, so the menu stays as smooth as it
   is bare. Pointer parallax was removed on 2026-09-03 for exactly that reason.

     time of day  -> <html data-daypart="day|dusk|night">   palette + which layers show
     season       -> <html data-season="marigold|snow|confetti|none">   falling particles
     moon phase   -> ink drawing on the cover (#fx-moon)
     ambient      -> papel picado, boat + wake, fireflies, moth, lantern swing, morning mist
     moments      -> paper-flip sound (toggle, remembered), corner-curl hint, steam on dishes

   Preview any state: /menu?daypart=dusk&season=snow&moon=0.5
   Lite / reduced-motion devices keep the palette, moon, sound and hint but skip the loops. */
(function () {
  'use strict';

  var root = document.documentElement;
  var params = new URLSearchParams(window.location.search);
  var SOUND_KEY = 'dg-sound';
  var HINT_KEY = 'dg-flip-hint';
  var PALETTE = ['#ff4fa3', '#ff8a2a', '#33c072', '#3b82f6', '#ffd23f', '#b45cf0'];
  var SYNODIC = 29.530588853; // days per lunation
  var NEW_MOON = Date.UTC(2000, 0, 6, 18, 14); // reference new moon
  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  function isLite() {
    return root.dataset.perf === 'lite' || motionQuery.matches;
  }
  function read(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
  }
  function rand(min, max) {
    return min + Math.random() * (max - min);
  }
  function make(tag, className, attrs) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        node.setAttribute(key, attrs[key]);
      });
    }
    return node;
  }

  /* ---------- the clock: time of day, season, moon ---------- */

  function daypartFor(date) {
    var hour = date.getHours();
    if (hour >= 6 && hour < 17) return 'day';
    if (hour >= 17 && hour < 20) return 'dusk';
    return 'night';
  }

  function seasonFor(date) {
    var month = date.getMonth() + 1;
    var day = date.getDate();
    if ((month === 10 && day >= 25) || (month === 11 && day <= 3)) return 'marigold'; // Día de los Muertos
    if (month === 12 || month === 1 || month === 2) return 'snow'; // Ogdensburg winter
    if ((month === 5 && day <= 6) || (month === 9 && (day === 15 || day === 16))) return 'confetti'; // Cinco de Mayo, Independencia
    return 'none';
  }

  function moonPhase(date) {
    var days = (date.getTime() - NEW_MOON) / 86400000;
    var phase = (days / SYNODIC) % 1;
    return phase < 0 ? phase + 1 : phase; // 0 new · 0.25 first quarter · 0.5 full · 0.75 last quarter
  }

  function pick(param, allowed, fallback) {
    var value = params.get(param);
    return allowed.indexOf(value) !== -1 ? value : fallback;
  }

  var now = new Date();
  var daypart = pick('daypart', ['day', 'dusk', 'night'], daypartFor(now));
  var season = pick('season', ['marigold', 'snow', 'confetti', 'none'], seasonFor(now));
  var moon = moonPhase(now);
  if (params.has('moon')) {
    var forced = parseFloat(params.get('moon'));
    if (forced >= 0 && forced <= 1) moon = forced % 1;
  }
  root.dataset.daypart = daypart;
  root.dataset.season = season;

  /* ---------- moon: an ink drawing of tonight's phase on the cover ---------- */

  function moonSvg(phase) {
    var r = 20;
    var cx = 24;
    var cy = 24;
    var lit = (1 - Math.cos(phase * Math.PI * 2)) / 2; // 0 dark → 1 full
    var waxing = phase < 0.5;
    var rx = (Math.abs(Math.cos(phase * Math.PI * 2)) * r).toFixed(2);
    var top = cx + ' ' + (cy - r);
    var bottom = cx + ' ' + (cy + r);
    // Lit limb: the right semicircle while waxing, the left while waning.
    var limb = 'A ' + r + ' ' + r + ' 0 0 ' + (waxing ? 1 : 0) + ' ' + bottom;
    // Terminator bulges toward the lit limb for a crescent, away from it for a gibbous.
    var crescent = lit < 0.5;
    var sweep = waxing ? (crescent ? 0 : 1) : crescent ? 1 : 0;
    var terminator = 'A ' + rx + ' ' + r + ' 0 0 ' + sweep + ' ' + top;
    return (
      '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" focusable="false">' +
      '<circle cx="24" cy="24" r="20" fill="rgba(42,27,18,0.30)"/>' +
      '<path d="M ' + top + ' ' + limb + ' ' + terminator + ' Z" fill="rgba(255,248,226,0.82)"/>' +
      '<circle cx="17" cy="19" r="2.6" fill="rgba(42,27,18,0.16)"/>' +
      '<circle cx="28" cy="29" r="3.4" fill="rgba(42,27,18,0.16)"/>' +
      '<circle cx="30" cy="16" r="1.7" fill="rgba(42,27,18,0.16)"/>' +
      '<circle cx="24" cy="24" r="20" fill="none" stroke="rgba(42,27,18,0.55)" stroke-width="1.4"/>' +
      '</svg>'
    );
  }

  function mountMoon() {
    var host = document.querySelector('.cover-page-content');
    if (!host || document.getElementById('fx-moon')) return;
    var wrap = make('div', 'fx-moon', { id: 'fx-moon', 'aria-hidden': 'true', 'data-phase': moon.toFixed(3) });
    wrap.innerHTML = moonSvg(moon);
    host.insertBefore(wrap, host.firstChild);
  }

  /* ---------- ambient layer (behind the book) ---------- */

  var FLAG_PATH =
    'M0 0H54V50L48 58 42 50 36 58 30 50 24 58 18 50 12 58 6 50 0 58Z' +
    'M27 16 37 30 27 44 17 30Z' +
    'M9 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0' +
    'M45 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0' +
    'M9 40m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0' +
    'M45 40m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0' +
    'M27 7m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0';

  function flagCount() {
    return Math.max(6, Math.min(22, Math.round(window.innerWidth / 96)));
  }

  function fillPicado(strip) {
    strip.innerHTML = '';
    var count = flagCount();
    for (var i = 0; i < count; i++) {
      var flag = make('span', 'fx-flag fx-loop');
      flag.style.setProperty('--i', String(i));
      flag.style.color = PALETTE[i % PALETTE.length];
      flag.innerHTML =
        '<svg viewBox="0 0 54 64" xmlns="http://www.w3.org/2000/svg" focusable="false">' +
        '<path d="' + FLAG_PATH + '" fill="currentColor" fill-rule="evenodd"/></svg>';
      strip.appendChild(flag);
    }
    strip.dataset.count = String(count);
  }

  function buildPicado() {
    var strip = make('div', 'fx-picado', { id: 'fx-picado' });
    fillPicado(strip);
    return strip;
  }

  function buildBoat() {
    var boat = make('div', 'fx-boat fx-loop', { id: 'fx-boat' });
    boat.innerHTML =
      '<div class="fx-boat-bob"><span class="fx-wake"></span>' +
      '<svg viewBox="0 0 160 60" xmlns="http://www.w3.org/2000/svg" focusable="false">' +
      '<g fill="#070b0f" stroke="rgba(255,220,160,0.30)" stroke-width="1">' +
      '<path d="M6 40H154L142 56H20Z"/>' +
      '<rect x="90" y="24" width="40" height="16" rx="2"/>' +
      '<rect x="98" y="13" width="22" height="11" rx="1.5"/>' +
      '<rect x="52" y="12" width="2" height="28" stroke="none"/>' +
      '<path d="M116 4h6v9h-6z"/>' +
      '</g>' +
      '<circle class="fx-boat-light" cx="109" cy="18.5" r="2.2" fill="#ffd27a"/>' +
      '<circle class="fx-boat-light" cx="53" cy="10.5" r="2" fill="#ff6a3d"/>' +
      '</svg></div>';
    return boat;
  }

  function buildFireflies(layer) {
    for (var i = 0; i < 12; i++) {
      var fly = make('i', 'fx-fly fx-loop');
      fly.style.cssText =
        '--x:' + rand(2, 98).toFixed(1) + '%;--y:' + rand(48, 92).toFixed(1) + '%;' +
        '--dx:' + rand(-70, 70).toFixed(0) + 'px;--dy:' + rand(-40, 40).toFixed(0) + 'px;' +
        '--d:' + rand(7, 15).toFixed(1) + 's;--b:' + rand(2.2, 4.8).toFixed(1) + 's;' +
        '--delay:' + (-rand(0, 8)).toFixed(1) + 's';
      layer.appendChild(fly);
    }
  }

  function supportsOffsetPath() {
    try {
      return Boolean(window.CSS && CSS.supports('offset-path', 'path("M0 0 L10 10")'));
    } catch (e) {
      return false;
    }
  }

  function buildMoth() {
    var moth = make('div', 'fx-moth fx-loop', { id: 'fx-moth' });
    moth.innerHTML =
      '<svg viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg" focusable="false">' +
      '<g class="fx-wing fx-wing-l"><path d="M11 8C4 0 0 3 1 8c-1 5 3 8 10 0z" fill="rgba(232,214,178,0.9)"/></g>' +
      '<g class="fx-wing fx-wing-r"><path d="M13 8c7-8 11-5 10 0 1 5-3 8-10 0z" fill="rgba(232,214,178,0.9)"/></g>' +
      '<ellipse cx="12" cy="8" rx="1.5" ry="4.2" fill="rgba(70,50,30,0.95)"/></svg>';
    return moth;
  }

  function mountAmbient() {
    if (document.getElementById('fx-ambient')) return;
    var layer = make('div', 'fx-ambient', { id: 'fx-ambient', 'aria-hidden': 'true' });
    layer.appendChild(make('div', 'fx-lantern fx-loop', { id: 'fx-lantern' }));
    layer.appendChild(make('div', 'fx-mist fx-loop', { id: 'fx-mist' }));
    var picado = buildPicado();
    layer.appendChild(picado);
    layer.appendChild(buildBoat());
    buildFireflies(layer);
    if (supportsOffsetPath()) layer.appendChild(buildMoth());
    document.body.appendChild(layer);

    var resizeTimer = 0;
    window.addEventListener(
      'resize',
      function () {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(function () {
          if (Number(picado.dataset.count) !== flagCount()) fillPicado(picado);
        }, 250);
      },
      { passive: true }
    );
  }

  /* ---------- seasonal overlay (above the book, never catches taps) ---------- */

  function mountSeason() {
    if (season === 'none' || document.getElementById('fx-overlay')) return;
    var overlay = make('div', 'fx-overlay', { id: 'fx-overlay', 'aria-hidden': 'true' });
    var kind = season === 'marigold' ? 'fx-petal' : season === 'snow' ? 'fx-flake' : 'fx-confetti';
    var spin = season === 'snow' ? 0 : season === 'marigold' ? 340 : 720;
    for (var i = 0; i < 16; i++) {
      var bit = make('i', 'fx-fall ' + kind + ' fx-loop');
      var duration = rand(9, 18);
      bit.style.cssText =
        '--x:' + rand(1, 99).toFixed(1) + '%;--d:' + duration.toFixed(1) + 's;' +
        '--delay:' + (-rand(0, duration)).toFixed(1) + 's;--sway:' + rand(-60, 60).toFixed(0) + 'px;' +
        '--spin:' + (spin ? (rand(0.6, 1.4) * spin).toFixed(0) : 0) + 'deg;--s:' + rand(0.7, 1.25).toFixed(2) +
        (kind === 'fx-confetti' ? ';--c:' + PALETTE[i % PALETTE.length] : '');
      overlay.appendChild(bit);
    }
    document.body.appendChild(overlay);
  }

  /* ---------- paper-flip sound: synthesized, so no audio file to ship ---------- */

  var audio = { ctx: null, noise: null };
  var soundOn = read(SOUND_KEY) !== '0';
  var LABELS = {
    'menu.soundOn': 'Page-turn sound on — tap to mute',
    'menu.soundOff': 'Page-turn sound off — tap to unmute',
  };

  function audioContext() {
    var Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    if (!audio.ctx) audio.ctx = new Context();
    if (audio.ctx.state === 'suspended' && typeof audio.ctx.resume === 'function') {
      try {
        audio.ctx.resume();
      } catch (e) {}
    }
    return audio.ctx;
  }

  function noiseBuffer(ctx) {
    if (!audio.noise) {
      var length = Math.floor(ctx.sampleRate * 0.4);
      audio.noise = ctx.createBuffer(1, length, ctx.sampleRate);
      var data = audio.noise.getChannelData(0);
      for (var i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    return audio.noise;
  }

  function playFlip() {
    try {
      var ctx = audioContext();
      if (!ctx) return false;
      var t = ctx.currentTime;
      var source = ctx.createBufferSource();
      source.buffer = noiseBuffer(ctx);
      var filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 0.8;
      filter.frequency.setValueAtTime(700, t);
      filter.frequency.exponentialRampToValueAtTime(2800, t + 0.11);
      filter.frequency.exponentialRampToValueAtTime(600, t + 0.3);
      var gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.14, t + 0.035);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start(t);
      source.stop(t + 0.34);
      return true;
    } catch (e) {
      return false;
    }
  }

  function labelKey() {
    return soundOn ? 'menu.soundOn' : 'menu.soundOff';
  }

  function label(key) {
    try {
      if (window.DGLang && typeof window.DGLang.t === 'function') return window.DGLang.t(key);
    } catch (e) {}
    return LABELS[key];
  }

  function setSound(on) {
    soundOn = Boolean(on);
    write(SOUND_KEY, soundOn ? '1' : '0');
    var btn = document.getElementById('fx-sound');
    if (btn) {
      btn.classList.toggle('is-off', !soundOn);
      btn.setAttribute('aria-pressed', String(soundOn));
      btn.setAttribute('data-i18n-aria', labelKey());
      btn.setAttribute('aria-label', label(labelKey()));
    }
  }

  function mountSoundToggle() {
    if (document.getElementById('fx-sound')) return;
    var btn = make('button', 'fx-sound' + (soundOn ? '' : ' is-off'), {
      id: 'fx-sound',
      type: 'button',
      'aria-pressed': String(soundOn),
      'data-i18n-aria': labelKey(),
      'aria-label': label(labelKey()),
    });
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">' +
      '<path d="M3 9v6h4l5 5V4L7 9H3z"/>' +
      '<path class="fx-sound-waves" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>' +
      '<path class="fx-sound-slash" d="M3.5 3.5 20.5 20.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/>' +
      '</svg>';
    btn.addEventListener('click', function (event) {
      event.stopPropagation();
      setSound(!soundOn);
      if (soundOn) playFlip(); // audible confirmation; also unlocks audio inside the gesture on iOS
    });
    document.body.appendChild(btn);
    placeSoundToggle();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeSoundToggle);
    document.addEventListener('dg:lang', placeSoundToggle);
    var placeTimer = 0;
    window.addEventListener(
      'resize',
      function () {
        window.clearTimeout(placeTimer);
        placeTimer = window.setTimeout(placeSoundToggle, 150);
      },
      { passive: true }
    );
  }

  // The chip's width depends on the loaded font, so measure it instead of guessing.
  function placeSoundToggle() {
    var btn = document.getElementById('fx-sound');
    var chip = document.getElementById('lang-toggle');
    if (!btn || !chip) return;
    var rect = chip.getBoundingClientRect();
    if (rect.width > 0) btn.style.left = Math.round(rect.right + 9) + 'px';
  }

  document.addEventListener('dg:turn', function () {
    if (!soundOn || document.hidden) return;
    playFlip();
  });

  /* ---------- corner-curl hint: the page corner peels a few times on a first visit ---------- */

  function stampFlipHint() {
    if (read(HINT_KEY)) return;
    write(HINT_KEY, '1');
    root.dataset.flipHint = 'true';
    window.setTimeout(function () {
      delete root.dataset.flipHint;
    }, 9000);
  }

  /* ---------- steam off a dish name (hover on desktop, tap on touch) ---------- */

  var steam = { hoverEl: null, timer: 0, downId: null, downX: 0, downY: 0, downTitle: null };

  function steamAllowed() {
    return !motionQuery.matches && !document.body.classList.contains('mlive-on');
  }

  function puff(title) {
    if (!title || title.querySelector('.fx-steam')) return;
    var wrap = make('span', 'fx-steam', { 'aria-hidden': 'true' });
    for (var i = 0; i < 3; i++) {
      var wisp = make('i');
      wisp.style.cssText =
        '--sx:' + (8 + i * 9) + 'px;--sd:' + (i * 0.13).toFixed(2) + 's;--wx:' + rand(-9, 9).toFixed(0) + 'px';
      wrap.appendChild(wisp);
    }
    title.insertBefore(wrap, title.firstChild);
    window.setTimeout(function () {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    }, 1600);
  }

  function titleOf(target) {
    return target && typeof target.closest === 'function' ? target.closest('.menu-item-title') : null;
  }

  function wireSteam() {
    document.addEventListener(
      'pointerover',
      function (event) {
        if (event.pointerType !== 'mouse' || !steamAllowed()) return;
        var title = titleOf(event.target);
        if (!title || title === steam.hoverEl) return;
        steam.hoverEl = title;
        window.clearTimeout(steam.timer);
        steam.timer = window.setTimeout(function () {
          puff(title);
        }, 220);
      },
      { passive: true }
    );
    document.addEventListener(
      'pointerout',
      function (event) {
        if (event.pointerType !== 'mouse' || !steam.hoverEl) return;
        if (titleOf(event.relatedTarget) === steam.hoverEl) return;
        window.clearTimeout(steam.timer);
        steam.hoverEl = null;
      },
      { passive: true }
    );
    // Touch: the scene captures the pointer for swipes, so remember the title at
    // pointerdown and puff on a still finger. Edge taps are page turns — leave them alone.
    document.addEventListener(
      'pointerdown',
      function (event) {
        if (event.pointerType === 'mouse') return;
        steam.downId = event.pointerId;
        steam.downX = event.clientX;
        steam.downY = event.clientY;
        steam.downTitle = titleOf(event.target);
      },
      { passive: true }
    );
    document.addEventListener(
      'pointerup',
      function (event) {
        if (event.pointerType === 'mouse' || event.pointerId !== steam.downId) return;
        var title = steam.downTitle;
        steam.downTitle = null;
        if (!title || !steamAllowed()) return;
        if (Math.hypot(event.clientX - steam.downX, event.clientY - steam.downY) > 12) return;
        var edge = window.innerWidth * 0.18;
        if (event.clientX <= edge || event.clientX >= window.innerWidth - edge) return;
        puff(title);
      },
      { passive: true }
    );
  }

  /* ---------- boot ---------- */

  function boot() {
    mountMoon();
    mountSoundToggle();
    stampFlipHint();
    if (!isLite()) {
      mountAmbient();
      mountSeason();
    }
    wireSteam();
  }

  window.DGAmbience = {
    moonPhase: moonPhase,
    daypartFor: daypartFor,
    seasonFor: seasonFor,
    getDaypart: function () {
      return daypart;
    },
    getSeason: function () {
      return season;
    },
    getMoon: function () {
      return moon;
    },
    soundEnabled: function () {
      return soundOn;
    },
    setSound: setSound,
    playFlip: playFlip,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
