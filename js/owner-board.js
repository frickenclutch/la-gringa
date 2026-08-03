// Owner dashboard for monthly swaps + daily specials
(function () {
  'use strict';

  const loginView = document.getElementById('owner-login');
  const editorView = document.getElementById('owner-editor');
  const loginForm = document.getElementById('owner-login-form');
  const pinInput = document.getElementById('owner-pin');
  const loginError = document.getElementById('owner-login-error');
  const claimView = document.getElementById('owner-claim');
  const claimForm = document.getElementById('owner-claim-form');
  const claimPin = document.getElementById('claim-pin');
  const claimPinConfirm = document.getElementById('claim-pin-confirm');
  const claimError = document.getElementById('owner-claim-error');
  const setupNote = document.getElementById('owner-setup-note');
  const pinForm = document.getElementById('owner-pin-form');
  const pinCurrent = document.getElementById('pin-current');
  const pinNew = document.getElementById('pin-new');
  const pinMsg = document.getElementById('owner-pin-msg');
  const loginNote = document.getElementById('owner-login-note');
  const saveForm = document.getElementById('owner-board-form');
  const statusEl = document.getElementById('owner-status');
  const specialsList = document.getElementById('specials-editor');
  const addSpecialBtn = document.getElementById('add-special');
  const historyList = document.getElementById('history-list');
  const logoutBtn = document.getElementById('owner-logout');
  const refreshHistoryBtn = document.getElementById('refresh-history');

  const fields = {
    label: document.getElementById('month-label'),
    year: document.getElementById('month-year'),
    notes: document.getElementById('month-notes'),
    additions: document.getElementById('month-additions'),
    takeaways: document.getElementById('month-takeaways'),
  };

  let board = null;

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.classList.toggle('is-error', Boolean(isError));
  }

  function linesToList(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function listToLines(list) {
    return (Array.isArray(list) ? list : []).join('\n');
  }

  function uid() {
    return 'sp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  async function api(path, options) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
      ...options,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || 'Request failed');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function showEditor(show) {
    if (loginView) loginView.hidden = show;
    if (editorView) editorView.hidden = !show;
    if (logoutBtn) logoutBtn.hidden = !show;
    if (show) {
      if (claimView) claimView.hidden = true;
      if (setupNote) setupNote.hidden = true;
    }
  }

  function showClaim(hasToken) {
    if (loginView) loginView.hidden = true;
    if (editorView) editorView.hidden = true;
    if (claimView) claimView.hidden = !hasToken;
    if (setupNote) setupNote.hidden = hasToken;
    if (hasToken && claimPin) claimPin.focus();
  }

  function getClaimToken() {
    const fromQuery = new URLSearchParams(window.location.search).get('claim');
    if (fromQuery) return fromQuery.trim();
    const hash = window.location.hash || '';
    if (hash.startsWith('#claim=')) return decodeURIComponent(hash.slice(7)).trim();
    return '';
  }

  function specialRow(special) {
    const row = document.createElement('article');
    row.className = 'special-row';
    row.dataset.id = special.id || uid();
    row.innerHTML =
      '<label>Name<input name="name" type="text" required value="" /></label>' +
      '<label>Price<input name="price" type="text" inputmode="decimal" value="" /></label>' +
      '<label class="span-2">Note<input name="note" type="text" value="" /></label>' +
      '<label>Starts<input name="startsOn" type="date" value="" /></label>' +
      '<label>Ends<input name="endsOn" type="date" value="" /></label>' +
      '<label class="active-toggle"><input name="active" type="checkbox" /> Active</label>' +
      '<button type="button" class="danger remove-special">Remove</button>';

    row.querySelector('[name="name"]').value = special.name || '';
    row.querySelector('[name="price"]').value = special.price || '';
    row.querySelector('[name="note"]').value = special.note || '';
    row.querySelector('[name="startsOn"]').value = special.startsOn || '';
    row.querySelector('[name="endsOn"]').value = special.endsOn || '';
    row.querySelector('[name="active"]').checked = special.active !== false;
    row.querySelector('.remove-special').addEventListener('click', () => row.remove());
    return row;
  }

  function renderSpecials(specials) {
    if (!specialsList) return;
    specialsList.innerHTML = '';
    const items = Array.isArray(specials) && specials.length ? specials : [
      { id: uid(), name: '', price: '', note: '', startsOn: '', endsOn: '', active: true },
    ];
    for (const item of items) specialsList.appendChild(specialRow(item));
  }

  function fillForm(data) {
    board = data;
    const month = data.month || {};
    if (fields.label) fields.label.value = month.label || '';
    if (fields.year) fields.year.value = month.year || new Date().getFullYear();
    if (fields.notes) fields.notes.value = month.notes || '';
    if (fields.additions) fields.additions.value = listToLines(month.additions);
    if (fields.takeaways) fields.takeaways.value = listToLines(month.takeaways);
    renderSpecials(data.specials);
  }

  function collectBoard() {
    const rows = Array.from(specialsList?.querySelectorAll('.special-row') || []);
    const specials = rows
      .map((row) => ({
        id: row.dataset.id || uid(),
        name: row.querySelector('[name="name"]')?.value.trim() || '',
        price: row.querySelector('[name="price"]')?.value.trim() || '',
        note: row.querySelector('[name="note"]')?.value.trim() || '',
        startsOn: row.querySelector('[name="startsOn"]')?.value || null,
        endsOn: row.querySelector('[name="endsOn"]')?.value || null,
        active: Boolean(row.querySelector('[name="active"]')?.checked),
      }))
      .filter((item) => item.name);

    return {
      month: {
        label: fields.label?.value.trim() || '',
        year: Number(fields.year?.value) || new Date().getFullYear(),
        notes: fields.notes?.value.trim() || '',
        additions: linesToList(fields.additions?.value),
        takeaways: linesToList(fields.takeaways?.value),
      },
      specials,
      updatedBy: 'owner',
    };
  }

  function renderHistory(history) {
    if (!historyList) return;
    historyList.innerHTML = '';
    if (!history?.length) {
      historyList.innerHTML = '<li class="muted">No snapshots yet — save once to start the audit trail.</li>';
      return;
    }
    for (const snap of history) {
      const li = document.createElement('li');
      const when = snap.at ? new Date(snap.at).toLocaleString() : 'unknown time';
      const label = snap.month?.label || 'Untitled month';
      const adds = (snap.month?.additions || []).length;
      const takes = (snap.month?.takeaways || []).length;
      const specs = (snap.specials || []).length;
      li.innerHTML =
        '<strong>' +
        label +
        '</strong>' +
        '<span>' +
        when +
        ' · ' +
        (snap.by || 'owner') +
        '</span>' +
        '<span>' +
        adds +
        ' adds · ' +
        takes +
        ' takes · ' +
        specs +
        ' specials</span>';
      historyList.appendChild(li);
    }
  }

  async function loadHistory() {
    try {
      const data = await api('/api/owner/history');
      renderHistory(data.history || []);
    } catch (error) {
      if (error.status === 401) {
        showEditor(false);
        return;
      }
      renderHistory([]);
    }
  }

  async function bootEditor() {
    try {
      const data = await api('/api/owner/board');
      fillForm(data);
      showEditor(true);
      await loadHistory();
      setStatus('Loaded live board.');
    } catch (error) {
      showEditor(false);
      if (error.status !== 401 && loginError) {
        loginError.textContent = error.message || 'Could not load board.';
      }
    }
  }

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (loginError) loginError.textContent = '';
    if (loginNote) loginNote.hidden = true;
    setStatus('');
    try {
      await api('/api/owner/login', {
        method: 'POST',
        body: JSON.stringify({ pin: pinInput?.value || '' }),
      });
      if (pinInput) pinInput.value = '';
      await bootEditor();
    } catch (error) {
      if (loginError) loginError.textContent = error.message || 'Login failed';
    }
  });

  saveForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('Saving…');
    try {
      const payload = collectBoard();
      const data = await api('/api/owner/board', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      fillForm(data.board || payload);
      await loadHistory();
      setStatus('Saved. Guests will see active specials and this month’s swaps.');
    } catch (error) {
      if (error.status === 401) {
        showEditor(false);
        setStatus('Session expired — sign in again.', true);
        return;
      }
      setStatus(error.message || 'Save failed', true);
    }
  });

  addSpecialBtn?.addEventListener('click', () => {
    specialsList?.appendChild(
      specialRow({ id: uid(), name: '', price: '', note: '', startsOn: '', endsOn: '', active: true })
    );
  });

  refreshHistoryBtn?.addEventListener('click', () => loadHistory());

  logoutBtn?.addEventListener('click', async () => {
    // The session cookie is HttpOnly — only the worker can actually clear it.
    try {
      await api('/api/owner/logout', { method: 'POST' });
    } catch {
      // Static preview without the worker; nothing server-side to clear.
    }
    if (pinInput) pinInput.value = '';
    if (loginError) loginError.textContent = '';
    setStatus('');
    showEditor(false);
    if (loginNote) {
      loginNote.textContent = 'Signed out — see you on the patio.';
      loginNote.hidden = false;
    }
    pinInput?.focus();
  });

  claimForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (claimError) claimError.textContent = '';
    const pin = claimPin?.value || '';
    if (pin.length < 6) {
      if (claimError) claimError.textContent = 'PIN must be at least 6 characters.';
      return;
    }
    if (pin !== (claimPinConfirm?.value || '')) {
      if (claimError) claimError.textContent = 'Those PINs don’t match — try again.';
      return;
    }
    try {
      await api('/api/owner/claim', {
        method: 'POST',
        body: JSON.stringify({ token: getClaimToken(), pin }),
      });
      // Burn the token out of the address bar/history.
      window.history.replaceState(null, '', window.location.pathname);
      await bootEditor();
      setStatus('Board claimed. This PIN is yours now — the setup link is dead.');
    } catch (error) {
      if (claimError) claimError.textContent = error.message || 'Claim failed';
    }
  });

  pinForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pinMsg) pinMsg.textContent = '';
    const next = pinNew?.value || '';
    if (next.length < 6) {
      if (pinMsg) pinMsg.textContent = 'New PIN must be at least 6 characters.';
      return;
    }
    try {
      await api('/api/owner/pin', {
        method: 'POST',
        body: JSON.stringify({ currentPin: pinCurrent?.value || '', newPin: next }),
      });
      if (pinCurrent) pinCurrent.value = '';
      if (pinNew) pinNew.value = '';
      if (pinMsg) pinMsg.textContent = 'PIN updated. Other signed-in devices were logged out.';
    } catch (error) {
      if (pinMsg) pinMsg.textContent = error.message || 'PIN change failed';
    }
  });

  async function boot() {
    let mode = 'login';
    try {
      const status = await api('/api/owner/status');
      mode = status?.mode || 'login';
    } catch {
      // Static preview without the worker — fall through to the login card.
    }
    if (mode === 'claim' || mode === 'unconfigured') {
      showClaim(mode === 'claim' && Boolean(getClaimToken()));
      return;
    }
    bootEditor();
  }

  boot();
})();
