/**
 * Social links that open the native app on phones.
 * Mark a link with data-app-link="facebook". On a desktop it stays a plain
 * new-tab link. On a phone a tap asks: open the Facebook app, or the website.
 * - Android: an intent:// URL opens the app, or falls back to the web page
 *   when the app is not installed (Chrome handles the fallback itself).
 * - iPhone/iPad: fb://facewebmodal opens the page inside the app; if the app
 *   is not there the tab is still visible after a moment, so we go to the web.
 * - Already inside Facebook/Messenger/Instagram: plain link, nothing to ask.
 */
(function () {
  'use strict';

  const links = document.querySelectorAll('a[data-app-link="facebook"]');
  if (!links.length) return;

  const ua = window.navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
  const isAndroid = /Android/.test(ua);
  const inMetaApp = /FBAN|FBAV|FBIOS|FB_IAB|FB4A|Instagram/.test(ua);
  if ((!isIos && !isAndroid) || inMetaApp) return;

  // English stands in until data/i18n.json has loaded.
  const EN = {
    'app.fbTitle': 'Open our Facebook page',
    'app.fbApp': 'Open in the Facebook app',
    'app.fbWeb': 'Open in the browser',
    'app.cancel': 'Cancel',
  };

  function t(key) {
    const lang = window.DGLang;
    const text = lang && lang.t ? lang.t(key) : key;
    return text === key ? EN[key] : text;
  }

  function appUrl(webUrl) {
    if (isAndroid) {
      const u = new URL(webUrl);
      return (
        'intent://' + u.host + u.pathname + u.search +
        '#Intent;scheme=https;package=com.facebook.katana;' +
        'S.browser_fallback_url=' + encodeURIComponent(webUrl) + ';end'
      );
    }
    return 'fb://facewebmodal/f?href=' + encodeURIComponent(webUrl);
  }

  function openApp(webUrl) {
    if (isIos) {
      // If the app took over, the page is hidden and the timer is cancelled.
      const timer = setTimeout(function () {
        if (!document.hidden) window.location.href = webUrl;
      }, 1600);
      document.addEventListener('visibilitychange', function onHide() {
        if (document.hidden) {
          clearTimeout(timer);
          document.removeEventListener('visibilitychange', onHide);
        }
      });
    }
    window.location.href = appUrl(webUrl);
  }

  // ---- chooser sheet ----
  const sheet = document.createElement('div');
  sheet.className = 'app-link-sheet';
  sheet.hidden = true;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', 'app-link-title');
  sheet.innerHTML =
    '<div class="app-link-panel">' +
    '<h2 id="app-link-title"></h2>' +
    '<button type="button" class="app-link-primary" data-act="app"></button>' +
    '<button type="button" class="app-link-secondary" data-act="web"></button>' +
    '<button type="button" class="app-link-cancel" data-act="cancel"></button>' +
    '</div>';
  document.body.appendChild(sheet);

  const style = document.createElement('style');
  style.textContent =
    '.app-link-sheet{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:flex-end;justify-content:center;' +
    'padding:1rem;padding-bottom:max(1rem,env(safe-area-inset-bottom));background:rgba(5,8,20,.7);' +
    '-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}' +
    '.app-link-sheet[hidden]{display:none}' +
    '.app-link-panel{width:min(380px,100%);display:grid;gap:.6rem;padding:1.25rem;border-radius:1.25rem;' +
    'background:#141a33;border:1px solid rgba(251,191,36,.35);box-shadow:0 -12px 40px rgba(0,0,0,.55);text-align:center}' +
    '.app-link-panel h2{margin:0 0 .35rem;color:#fbbf24;font-size:.95rem;letter-spacing:.08em;text-transform:uppercase}' +
    '.app-link-panel button{font:inherit;font-weight:700;font-size:.95rem;border-radius:999px;padding:.8rem 1rem;cursor:pointer}' +
    '.app-link-primary{background:#1877f2;color:#fff;border:0}' +
    '.app-link-secondary{background:transparent;color:#e2e8f0;border:1px solid rgba(226,232,240,.35)}' +
    '.app-link-cancel{background:transparent;color:#94a3b8;border:0;font-weight:500!important}';
  document.head.appendChild(style);

  let pendingUrl = null;
  let opener = null;

  function fill() {
    sheet.querySelector('#app-link-title').textContent = t('app.fbTitle');
    sheet.querySelector('[data-act="app"]').textContent = t('app.fbApp');
    sheet.querySelector('[data-act="web"]').textContent = t('app.fbWeb');
    sheet.querySelector('[data-act="cancel"]').textContent = t('app.cancel');
  }

  function open(url, from) {
    pendingUrl = url;
    opener = from;
    fill();
    sheet.hidden = false;
    sheet.querySelector('[data-act="app"]').focus();
  }

  function close() {
    sheet.hidden = true;
    if (opener) opener.focus();
  }

  sheet.addEventListener('click', function (e) {
    if (e.target === sheet) return close();
    const act = e.target.closest('button') && e.target.closest('button').dataset.act;
    if (!act) return;
    const url = pendingUrl;
    close();
    if (act === 'app') openApp(url);
    else if (act === 'web') window.open(url, '_blank', 'noopener');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !sheet.hidden) close();
  });

  links.forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      open(a.href, a);
    });
  });
})();
