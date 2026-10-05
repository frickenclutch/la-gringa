/**
 * Share or print the menu.
 * - Share: the phone's own share sheet (texts, Messenger, email…) when the
 *   browser has one; otherwise the link is copied to the clipboard.
 * - Print: window.print(). The print stylesheet in menu.html lays the book's
 *   pages out flat, in reading order, so it also makes a clean PDF.
 * - Inside Facebook/Instagram's built-in browser printing does nothing, so
 *   the Print choice is hidden there.
 */
(function () {
  'use strict';

  const btn = document.getElementById('menu-share-btn');
  const sheet = document.getElementById('share-sheet');
  if (!btn || !sheet) return;

  const shareBtn = document.getElementById('share-sheet-share');
  const printBtn = document.getElementById('share-sheet-print');
  const closeBtn = document.getElementById('share-sheet-close');
  const status = document.getElementById('share-sheet-status');
  const MENU_URL = 'https://dirtygringonny.com/menu';

  const ua = window.navigator.userAgent || '';
  if (/FBAN|FBAV|FBIOS|FB_IAB|FB4A|Instagram/.test(ua) && printBtn) printBtn.hidden = true;

  // English stands in until data/i18n.json has loaded.
  const EN = {
    'menu.shareCopied': 'Link copied — paste it anywhere',
    'menu.shareText': 'Fresh Mex on the Ogdensburg riverfront — check out the Dirty Gringo menu.',
    'menu.printStamp': 'Printed {date} · Prices may change — the latest menu is always at dirtygringonny.com/menu',
  };

  function t(key) {
    const lang = window.DGLang;
    const text = lang && lang.t ? lang.t(key) : key;
    return text === key ? EN[key] : text;
  }

  function open() {
    if (status) status.textContent = '';
    sheet.hidden = false;
    sheet.setAttribute('aria-hidden', 'false');
    document.body.classList.add('install-coach-open');
    (shareBtn || closeBtn).focus();
  }

  function close() {
    sheet.hidden = true;
    sheet.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('install-coach-open');
    btn.focus();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(MENU_URL);
    } catch (e) {
      // Old browsers: select a throwaway field and copy from it.
      const field = document.createElement('textarea');
      field.value = MENU_URL;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      try { document.execCommand('copy'); } catch (err) {}
      field.remove();
    }
    if (status) status.textContent = t('menu.shareCopied');
  }

  async function share() {
    const data = { title: 'The Dirty Gringo — Menu', text: t('menu.shareText'), url: MENU_URL };
    if (navigator.share) {
      try {
        await navigator.share(data);
        close();
      } catch (e) {
        // AbortError = the guest closed the share sheet; anything else, copy instead.
        if (e && e.name !== 'AbortError') copyLink();
      }
      return;
    }
    copyLink();
  }

  // Wait (briefly) for the owner's latest prices before the page is captured.
  function liveEditsReady() {
    const live = window.DGMenuLive;
    if (!live || !live.ready) return Promise.resolve();
    return Promise.race([
      live.ready(),
      new Promise(function (resolve) { setTimeout(resolve, 2500); }),
    ]);
  }

  async function print() {
    close();
    await liveEditsReady();
    // Let the sheet disappear before the print preview snapshots the page.
    setTimeout(function () { window.print(); }, 60);
  }

  // Stamp paper and PDF copies with the day they were made, in the reader's
  // language, so an old printout is easy to spot. Runs for Ctrl+P too.
  const stamp = document.getElementById('print-stamp');
  function stampDate() {
    if (!stamp) return;
    const lang = (window.DGLang && window.DGLang.get && window.DGLang.get()) || 'en';
    let date;
    try {
      date = new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'America/New_York' }).format(new Date());
    } catch (e) {
      date = new Date().toLocaleDateString();
    }
    stamp.textContent = t('menu.printStamp').split('{date}').join(date);
  }
  window.addEventListener('beforeprint', stampDate);
  document.addEventListener('dg:lang', stampDate);
  stampDate();

  btn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    open();
  });
  if (shareBtn) shareBtn.addEventListener('click', share);
  if (printBtn) printBtn.addEventListener('click', print);
  if (closeBtn) closeBtn.addEventListener('click', close);
  sheet.addEventListener('click', function (e) {
    if (e.target === sheet) close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !sheet.hidden) close();
  });
})();
