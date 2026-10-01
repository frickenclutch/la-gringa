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
  const mirrorNote = document.getElementById('owner-mirror-note');
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
      // Static hosts (the pages.dev mirror, local previews) answer API calls
      // with empty 404/405s — name the real problem instead of "Request failed".
      const staticHost = res.status === 404 || res.status === 405;
      const err = new Error(
        (data && data.error) ||
          (staticHost
            ? 'Owner tools don’t run on this address — use the main site.'
            : 'Request failed (HTTP ' + res.status + ')')
      );
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

  function showMirrorNote() {
    if (loginView) loginView.hidden = true;
    if (editorView) editorView.hidden = true;
    if (claimView) claimView.hidden = true;
    if (setupNote) setupNote.hidden = true;
    if (mirrorNote) mirrorNote.hidden = false;
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
      await loadFacebook();
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

  // ---- Facebook drafts ----
  // The worker reads the TDG page on weekday mornings and keeps what it found
  // as drafts. "Add to board" only fills this form; the owner still saves.
  const fb = {
    summary: document.getElementById('fb-summary'),
    error: document.getElementById('fb-error'),
    list: document.getElementById('fb-drafts'),
    connect: document.getElementById('fb-connect'),
    connected: document.getElementById('fb-connected'),
    check: document.getElementById('fb-check'),
    disconnect: document.getElementById('fb-disconnect'),
    appId: document.getElementById('fb-app-id'),
    appSecret: document.getElementById('fb-app-secret'),
    token: document.getElementById('fb-token'),
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fbError(message) {
    if (!fb.error) return;
    fb.error.textContent = message || '';
    fb.error.hidden = !message;
  }

  function addDraftToForm(draft) {
    for (const s of draft.specials || []) {
      specialsList?.appendChild(
        specialRow({ id: uid(), name: s.name, price: s.price, note: s.note, startsOn: s.startsOn, endsOn: s.endsOn, active: true })
      );
    }
    const mergeLines = (field, items) => {
      if (!field || !items?.length) return;
      const have = linesToList(field.value);
      field.value = listToLines(have.concat(items.filter((x) => !have.includes(x))));
    };
    mergeLines(fields.additions, draft.additions);
    mergeLines(fields.takeaways, draft.takeaways);
    if (draft.notes && fields.notes) fields.notes.value = draft.notes;
    setStatus('Draft added to the board form above — check it, then press Save board.');
    saveForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function draftItem(draft) {
    const li = document.createElement('li');
    li.className = 'fb-draft';
    const when = draft.postedAt ? new Date(draft.postedAt).toLocaleString() : '';
    const parts = [];
    for (const s of draft.specials || []) {
      const dates = s.startsOn || s.endsOn ? ' (' + (s.startsOn || '…') + ' → ' + (s.endsOn || '…') + ')' : '';
      parts.push('<li>Special: <strong>' + escapeHtml(s.name) + '</strong>' + (s.price ? ' — $' + escapeHtml(s.price) : '') + escapeHtml(dates) + (s.note ? ' · ' + escapeHtml(s.note) : '') + '</li>');
    }
    for (const a of draft.additions || []) parts.push('<li>New on the menu: ' + escapeHtml(a) + '</li>');
    for (const t of draft.takeaways || []) parts.push('<li>Gone from the menu: ' + escapeHtml(t) + '</li>');
    if (draft.notes) parts.push('<li>Note: ' + escapeHtml(draft.notes) + '</li>');
    li.innerHTML =
      '<blockquote>' + escapeHtml(draft.excerpt) + '</blockquote>' +
      '<ul>' + parts.join('') + '</ul>' +
      '<div class="meta">Posted ' + escapeHtml(when) + ' · <a href="' + escapeHtml(draft.link) + '" target="_blank" rel="noopener">see the post</a></div>' +
      '<div class="actions"><button type="button" class="fb-use">Add to board</button>' +
      '<button type="button" class="secondary fb-dismiss">Dismiss</button></div>';
    const decide = async (status) => {
      try {
        renderFacebook(await api('/api/owner/facebook/draft', { method: 'POST', body: JSON.stringify({ id: draft.id, status }) }));
      } catch (error) {
        fbError(error.message);
      }
    };
    li.querySelector('.fb-use').addEventListener('click', () => {
      addDraftToForm(draft);
      decide('used');
    });
    li.querySelector('.fb-dismiss').addEventListener('click', () => decide('dismissed'));
    return li;
  }

  function renderFacebook(status) {
    if (!status) return;
    if (fb.connect) fb.connect.hidden = status.connected;
    if (fb.connected) fb.connected.hidden = !status.connected;
    if (fb.check) fb.check.hidden = !status.connected;
    if (fb.summary && status.connected) {
      const last = status.lastCheck ? new Date(status.lastCheck).toLocaleString() : 'not yet';
      fb.summary.textContent =
        'Connected to ' + (status.pageName || 'Facebook') + '. Checked weekday mornings 6–10 am · last check: ' + last + '.';
    }
    fbError(status.lastError ? 'Last check failed: ' + status.lastError + ' — if this keeps happening, disconnect and connect again.' : '');
    if (fb.list) {
      fb.list.innerHTML = '';
      const drafts = status.drafts || [];
      if (status.connected && !drafts.length) {
        fb.list.innerHTML = '<li class="muted">No new drafts — nothing on Facebook that looks like a special or menu change.</li>';
      }
      for (const d of drafts) fb.list.appendChild(draftItem(d));
    }
  }

  async function loadFacebook() {
    try {
      renderFacebook(await api('/api/owner/facebook'));
    } catch (error) {
      if (error.status !== 401) fbError(error.message);
    }
  }

  fb.connect?.addEventListener('submit', async (event) => {
    event.preventDefault();
    fbError('');
    const button = fb.connect.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      const status = await api('/api/owner/facebook', {
        method: 'PUT',
        body: JSON.stringify({
          appId: fb.appId?.value.trim(),
          appSecret: fb.appSecret?.value.trim(),
          token: fb.token?.value.trim(),
          page: 'tdg.ogdensburg',
        }),
      });
      for (const input of [fb.appId, fb.appSecret, fb.token]) if (input) input.value = '';
      renderFacebook(status);
    } catch (error) {
      fbError(error.message);
    } finally {
      if (button) button.disabled = false;
    }
  });

  fb.check?.addEventListener('click', async () => {
    fb.check.disabled = true;
    try {
      renderFacebook(await api('/api/owner/facebook/check', { method: 'POST' }));
    } catch (error) {
      fbError(error.message);
    } finally {
      fb.check.disabled = false;
    }
  });

  fb.disconnect?.addEventListener('click', async () => {
    if (!window.confirm('Stop reading the Facebook page? Pending drafts stay until you dismiss them.')) return;
    try {
      renderFacebook(await api('/api/owner/facebook', { method: 'DELETE' }));
    } catch (error) {
      fbError(error.message);
    }
  });


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
    // The status probe must return real JSON with a mode. Static hosts (the
    // pages.dev mirror, local file previews) 404 it or answer with HTML —
    // there is no worker there, so the PIN login can never succeed. Say so.
    let mode = null;
    try {
      const status = await api('/api/owner/status');
      mode = status && status.mode ? status.mode : null;
    } catch {
      mode = null;
    }
    if (!mode) {
      showMirrorNote();
      return;
    }
    if (mode === 'claim' || mode === 'unconfigured') {
      showClaim(mode === 'claim' && Boolean(getClaimToken()));
      return;
    }
    bootEditor();
  }

  boot();
})();
