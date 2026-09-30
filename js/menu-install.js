/**
 * Adaptive "Install Menu" / Get the Menu App.
 * - Chromium: uses beforeinstallprompt
 * - iOS Safari: coach mark → Share → Add to Home Screen
 * - In-app browsers (Facebook, Messenger, Instagram): coach mark → open in
 *   the real browser first, since the in-app view cannot install anything
 * - Other browsers: coach mark with browser-agnostic tips
 * - Already installed / standalone: hide the control
 */
(function () {
  'use strict';

  const btn = document.getElementById('menu-install-btn');
  const coach = document.getElementById('install-coach');
  const coachClose = document.getElementById('install-coach-close');
  const coachDismiss = document.getElementById('install-coach-dismiss');
  const coachBody = document.getElementById('install-coach-body');
  if (!btn) return;

  let deferredPrompt = null;

  function isStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.navigator.standalone === true
    );
  }

  function isIos() {
    const ua = window.navigator.userAgent || '';
    const iOS = /iPad|iPhone|iPod/.test(ua);
    const iPadOS = ua.includes('Mac') && 'ontouchend' in document;
    return iOS || iPadOS;
  }

  // Meta's in-app browsers tag their user agent: FBAN/FBAV/FBIOS on iPhone,
  // FB_IAB/FB4A on Android, "Instagram" for Instagram. They have no Share →
  // Add to Home Screen and never fire beforeinstallprompt.
  function inAppBrowser() {
    const ua = window.navigator.userAgent || '';
    if (/Instagram/.test(ua)) return 'Instagram';
    if (/FBAN|FBAV|FBIOS|FB_IAB|FB4A/.test(ua)) return /Messenger/.test(ua) ? 'Messenger' : 'Facebook';
    return null;
  }

  function showBtn() {
    btn.hidden = false;
    btn.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(function () {
      btn.classList.add('is-visible');
    });
  }

  function hideBtn() {
    btn.classList.remove('is-visible');
    btn.hidden = true;
    btn.setAttribute('aria-hidden', 'true');
  }

  function t(key, vars) {
    const lang = window.DGLang;
    let text = lang && lang.t ? lang.t(key) : key;
    Object.keys(vars || {}).forEach(function (name) {
      text = text.split('{' + name + '}').join(vars[name]);
    });
    return text;
  }

  function steps(keys, vars) {
    return (
      '<ol class="install-coach-steps">' +
      keys
        .map(function (key, i) {
          return '<li><span class="step-num">' + (i + 1) + '</span><span>' + t(key, vars) + '</span></li>';
        })
        .join('') +
      '</ol>'
    );
  }

  // Coach copy comes from data/i18n.json (menu.install*) so it follows the
  // reader's EN/ES/FR choice; {button} is the translated install label.
  function fillCoach() {
    if (!coachBody) return;
    const vars = { button: t('menu.installFull') };
    const inApp = inAppBrowser();
    if (inApp) {
      vars.app = inApp;
      vars.browser = isIos() ? 'Safari' : 'Chrome';
      coachBody.innerHTML =
        '<p>' + t('menu.installInApp', vars) + '</p>' +
        steps(['menu.installInApp1', 'menu.installInApp2', 'menu.installInApp3'], vars);
    } else if (isIos()) {
      coachBody.innerHTML =
        '<p>' + t('menu.installBody') + '</p>' +
        steps(['menu.installIos1', 'menu.installIos2', 'menu.installIos3'], vars);
    } else if (deferredPrompt) {
      coachBody.innerHTML = '<p>' + t('menu.installPrompt', vars) + '</p>';
    } else {
      coachBody.innerHTML =
        '<p>' + t('menu.installOther') + '</p>' +
        steps(['menu.installOther1', 'menu.installOther2', 'menu.installOther3'], vars);
    }
  }

  function openCoach() {
    if (!coach) return;
    fillCoach();
    coach.hidden = false;
    coach.setAttribute('aria-hidden', 'false');
    document.body.classList.add('install-coach-open');
    (coachClose || coach).focus();
  }

  function closeCoach() {
    if (!coach) return;
    coach.hidden = true;
    coach.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('install-coach-open');
    btn.focus();
  }

  async function tryNativeInstall() {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (choice && choice.outcome === 'accepted') {
      hideBtn();
      return true;
    }
    return false;
  }

  async function onInstallClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (await tryNativeInstall()) return;
    openCoach();
  }

  if (isStandalone()) {
    hideBtn();
    return;
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    showBtn();
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    hideBtn();
    closeCoach();
  });

  setTimeout(function () {
    if (!isStandalone() && btn.hidden) showBtn();
  }, 800);

  btn.addEventListener('click', onInstallClick);
  if (coachClose) coachClose.addEventListener('click', closeCoach);
  if (coachDismiss) coachDismiss.addEventListener('click', closeCoach);
  if (coach) {
    coach.addEventListener('click', function (e) {
      if (e.target === coach) closeCoach();
    });
  }
  document.addEventListener('dg:lang', function () {
    if (coach && !coach.hidden) fillCoach();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && coach && !coach.hidden) closeCoach();
  });
})();
