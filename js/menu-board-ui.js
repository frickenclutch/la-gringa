// Guest street board + monthly cycle strip for menu.html
(function () {
  'use strict';

  const FALLBACK_URL = '/data/menu-board.json';
  const API_URL = '/api/menu-board';

  const monthEl = document.getElementById('cover-month');
  const openBtn = document.getElementById('specials-board-btn');
  const overlay = document.getElementById('street-board');
  const closeBtn = document.getElementById('street-board-close');
  const listEl = document.getElementById('street-board-list');
  const emptyEl = document.getElementById('street-board-empty');
  const monthStrip = document.getElementById('month-cycle-strip');
  const monthAdds = document.getElementById('month-adds');
  const monthTakes = document.getElementById('month-takes');
  const monthNotes = document.getElementById('month-notes');

  if (!openBtn || !overlay || !listEl) return;

  // Always available on every manuscript page — show immediately, fill content when ready.
  openBtn.hidden = false;
  openBtn.setAttribute('aria-hidden', 'false');
  openBtn.classList.add('is-visible');

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function closeDialer() {
    const dialer = document.getElementById('dialer');
    if (dialer) dialer.classList.remove('open');
    document.body.classList.remove('dialer-open');
  }

  function setOpen(open) {
    if (open) {
      closeDialer();
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('street-board-open');
      openBtn.setAttribute('aria-expanded', 'true');
      closeBtn?.focus();
    } else {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('street-board-open');
      openBtn.setAttribute('aria-expanded', 'false');
      openBtn.focus();
    }
  }

  function renderSpecials(specials) {
    const items = Array.isArray(specials) ? specials : [];
    listEl.innerHTML = '';
    if (!items.length) {
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    for (const item of items) {
      const li = document.createElement('li');
      li.className = 'street-board-item';
      li.innerHTML =
        '<div class="street-board-item-title">' +
        '<span class="street-board-chalk">' +
        escapeHtml(item.name) +
        '</span>' +
        (item.price
          ? '<span class="street-board-price street-board-chalk">' + escapeHtml(item.price) + '</span>'
          : '') +
        '</div>' +
        (item.note ? '<p class="street-board-note">' + escapeHtml(item.note) + '</p>' : '');
      listEl.appendChild(li);
    }
  }

  function renderMonth(month) {
    if (!month) return;
    if (monthEl && month.label) {
      monthEl.textContent = month.label;
    }
    if (!monthStrip) return;

    const adds = Array.isArray(month.additions) ? month.additions : [];
    const takes = Array.isArray(month.takeaways) ? month.takeaways : [];
    const hasCycle = adds.length || takes.length || month.notes;

    if (!hasCycle) {
      monthStrip.hidden = true;
      return;
    }

    monthStrip.hidden = false;
    if (monthAdds) {
      monthAdds.innerHTML = adds.length
        ? adds.map((a) => '<li>' + escapeHtml(a) + '</li>').join('')
        : '<li class="muted">None listed</li>';
    }
    if (monthTakes) {
      monthTakes.innerHTML = takes.length
        ? takes.map((t) => '<li>' + escapeHtml(t) + '</li>').join('')
        : '<li class="muted">None listed</li>';
    }
    if (monthNotes) {
      monthNotes.textContent = month.notes || '';
      monthNotes.hidden = !month.notes;
    }
  }

  function applyBoard(board) {
    if (!board) return;
    renderMonth(board.month);
    renderSpecials(board.specials);
  }

  async function fetchJson(url, timeoutMs) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller
      ? window.setTimeout(function () {
          controller.abort();
        }, timeoutMs || 3500)
      : null;
    try {
      const res = await fetch(url, {
        credentials: 'same-origin',
        signal: controller ? controller.signal : undefined,
      });
      if (!res.ok) throw new Error('bad status ' + res.status);
      return res.json();
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }

  async function loadBoard() {
    try {
      return await fetchJson(API_URL, 3500);
    } catch {
      return fetchJson(FALLBACK_URL, 2500);
    }
  }

  openBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
  });

  closeBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) setOpen(false);
  });

  // Keep manuscript page-turn gestures when the board is closed.
  overlay.addEventListener(
    'pointerdown',
    (event) => {
      event.stopPropagation();
    },
    true
  );

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !overlay.hidden) setOpen(false);
  });

  // Refresh chrome strings if language flips after board render.
  document.addEventListener('dg:lang', function () {
    if (window.DGLang && typeof window.DGLang.apply === 'function') window.DGLang.apply();
  });

  // ---- Owner's secret door ----
  // Five quick taps on the cover wax seal walk staff to the PIN gate at /owner.
  // Deliberately silent until it triggers; the PIN is the real lock, this is a doorbell.
  const seal = document.getElementById('cover-seal');
  if (seal) {
    const TAPS_NEEDED = 5;
    const TAP_WINDOW_MS = 2500;
    let taps = [];
    let unlocking = false;
    seal.addEventListener('pointerdown', (event) => {
      // Keep seal taps out of the page-flip gesture engine.
      event.stopPropagation();
      if (unlocking) return;
      const now = Date.now();
      taps = taps.filter((t) => now - t < TAP_WINDOW_MS);
      taps.push(now);
      if (taps.length < TAPS_NEEDED) return;
      unlocking = true;
      taps = [];
      if (window.DGHaptics) window.DGHaptics.trigger('success');
      seal.classList.remove('is-singeing');
      void seal.offsetWidth; // restart the flame even if a flip just played it
      seal.classList.add('is-singeing');
      window.setTimeout(() => {
        window.location.href = '/owner';
      }, 650);
    });
  }

  loadBoard()
    .then(applyBoard)
    .catch(() => {
      applyBoard({
        month: { label: monthEl?.textContent || 'This month', additions: [], takeaways: [], notes: '' },
        specials: [],
      });
    });
})();
