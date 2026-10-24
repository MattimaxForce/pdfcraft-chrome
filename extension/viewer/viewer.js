// Wrapper page: fetches the PDF (with the site's cookies), hands it to PdfCraft via postMessage and handles saves.
(() => {
  const t = (k) => chrome.i18n.getMessage(k);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  document.documentElement.lang = chrome.i18n.getMessage('@@ui_locale').replace('_', '-');
  const params = new URLSearchParams(location.search);
  const src = params.get('file');
  const frame = document.getElementById('app');
  const msg = document.getElementById('msg');
  const msgBody = document.getElementById('msgbody');
  let dirty = false;

  const nameOf = () => {
    const given = params.get('name');
    if (given) return given;
    if (!src) return 'document.pdf';
    try {
      const last = decodeURIComponent(src.split(/[?#]/)[0].split('/').pop() || '');
      return last || 'document.pdf';
    } catch { return 'document.pdf'; }
  };
  const name = nameOf();
  if (src) document.title = name + ' — PdfCraft';

  function showError(html) {
    msgBody.innerHTML = html;
    msg.style.display = 'flex';
    frame.style.display = 'none';
  }

  // 1) fetch the bytes right away while the app (wasm) starts in parallel
  const bytes = src
    ? fetch(src, { credentials: 'include' }).then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.arrayBuffer();
      })
    : Promise.resolve(null);
  bytes.catch(() => {}); // avoid an "unhandled rejection": the error is shown below

  // 2) bridge with the app
  window.addEventListener('message', async (e) => {
    if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
    const d = e.data || {};
    if (d.type === 'pdfcraft:ready') {
      try {
        const buf = await bytes;
        if (buf) frame.contentWindow.postMessage({ type: 'pdfcraft:open', name, bytes: buf }, location.origin, [buf]);
      } catch (err) {
        const isFile = /^file:/i.test(src || '');
        showError(
          '<h2>' + t('errTitle') + '</h2>' +
          (isFile
            ? '<p>' + esc(t('errFile')) + '</p><p><code>chrome://extensions/?id=' + chrome.runtime.id + '</code></p><p>' + esc(t('errFileCopy')) + '</p>'
            : '<p>' + esc(chrome.i18n.getMessage('errServer', [String(err.message || err)])) + '</p>') +
          '<p><a href="#" id="retry">' + esc(t('errRetry')) + '</a></p>'
        );
        document.getElementById('retry')?.addEventListener('click', (ev) => { ev.preventDefault(); location.reload(); });
      }
    } else if (d.type === 'pdfcraft:save') {
      const url = URL.createObjectURL(new Blob([d.bytes], { type: 'application/pdf' }));
      const filename = (d.name || name).replace(/[\\/:*?"<>|]/g, '_');
      chrome.downloads.download({ url, filename, saveAs: !!d.saveAs, conflictAction: 'uniquify' }, () => {
        void chrome.runtime.lastError;
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      });
    } else if (d.type === 'pdfcraft:dirty') {
      dirty = !!d.dirty;
    } else if (d.type === 'pdfcraft:failed') {
      showError('<h2>' + esc(t('errStartTitle')) + '</h2><p>' + esc(String(d.error || '')) + '</p><p>' + esc(t('errWebgl')) + '</p>');
    }
  });

  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  // 3) start the app (after the listener is registered)
  frame.src = '../app/index.html?host=parent';
})();
