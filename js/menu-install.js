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

  function fillCoach() {
    if (!coachBody) return;
    const inApp = inAppBrowser();
    if (inApp) {
      const browser = isIos() ? 'Safari' : 'Chrome';
      coachBody.innerHTML =
        '<p>You’re reading this inside ' + inApp + '. To keep the menu on your phone, open it in ' + browser + ' first.</p>' +
        '<ol class="install-coach-steps">' +
        '<li><span class="step-num">1</span><span>Tap <strong>⋯</strong> (or <strong>⋮</strong>) in the top corner</span></li>' +
        '<li><span class="step-num">2</span><span>Choose <strong>Open in ' + browser + '</strong> or <strong>Open in external browser</strong></span></li>' +
        '<li><span class="step-num">3</span><span>Tap <strong>Get the Menu App</strong> again there</span></li>' +
        '</ol>';
    } else if (isIos()) {
      coachBody.innerHTML =
        '<p>Install the Dirty Gringo manuscript like an app — opens straight to the menu, even on weak patio signal.</p>' +
        '<ol class="install-coach-steps">' +
        '<li><span class="step-num">1</span><span>Tap <strong>Share</strong> in Safari’s toolbar</span></li>' +
        '<li><span class="step-num">2</span><span>Choose <strong>Add to Home Screen</strong></span></li>' +
        '<li><span class="step-num">3</span><span>Confirm — look for <strong>DG Menu</strong></span></li>' +
        '</ol>';
    } else if (deferredPrompt) {
      coachBody.innerHTML =
        '<p>Your browser can install this menu as an app. Tap <strong>Get the Menu App</strong> again and confirm the install prompt.</p>';
    } else {
      coachBody.innerHTML =
        '<p>Install from your browser menu:</p>' +
        '<ol class="install-coach-steps">' +
        '<li><span class="step-num">1</span><span>Open the browser <strong>menu</strong> (⋮ or ⋯)</span></li>' +
        '<li><span class="step-num">2</span><span>Choose <strong>Install app</strong> / <strong>Add to Home screen</strong></span></li>' +
        '<li><span class="step-num">3</span><span>Open <strong>DG Menu</strong> anytime — starts on the manuscript</span></li>' +
        '</ol>';
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
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && coach && !coach.hidden) closeCoach();
  });
})();
