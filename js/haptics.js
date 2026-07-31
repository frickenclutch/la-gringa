/**
 * Best-effort tactile feedback for browsers with the Vibration API.
 * iOS/iPadOS intentionally fall back to the site's visual/audio feedback.
 */
(function () {
  'use strict';

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const patterns = {
    page: 12,
    light: 8,
    success: [12, 28, 12],
    warning: [20, 38, 20],
    win: [20, 45, 20, 45, 32],
  };
  let lastPulseAt = 0;

  function isReducedMotion() {
    return motionQuery.matches;
  }

  function canVibrate() {
    return !isReducedMotion() && typeof navigator.vibrate === 'function';
  }

  function trigger(kind) {
    if (!canVibrate()) return false;

    const now = Date.now();
    if (now - lastPulseAt < 60) return false;
    lastPulseAt = now;

    try {
      return navigator.vibrate(patterns[kind] || patterns.light);
    } catch {
      return false;
    }
  }

  window.DGHaptics = {
    trigger,
    canVibrate,
    isReducedMotion,
  };
})();
