const t = (k) => chrome.i18n.getMessage(k);
document.documentElement.lang = chrome.i18n.getMessage('@@ui_locale').replace('_', '-');
document.querySelectorAll('[data-i]').forEach((el) => { el.textContent = t(el.dataset.i); });
const DEFAULTS = { auto: true, downloads: true, badge: true };
const $ = (id) => document.getElementById(id);

chrome.storage.sync.get(DEFAULTS).then((s) => {
  for (const k of Object.keys(DEFAULTS)) {
    $(k).checked = s[k];
    $(k).addEventListener('change', () => chrome.storage.sync.set({ [k]: $(k).checked }));
  }
});

$('openLocal').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('viewer/viewer.html') });
  window.close();
});

chrome.extension.isAllowedFileSchemeAccess().then((ok) => {
  if (ok) return;
  $('file').append(t('popFileAccess') + ' ');
  const a = document.createElement('a');
  a.textContent = t('popFileAccessLink');
  a.addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id }));
  $('file').append(a);
});

// If the active tab is our viewer showing a web PDF, offer the escape hatch to Chrome's viewer.
chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  if (!tab?.url?.startsWith(chrome.runtime.getURL('viewer/viewer.html'))) return;
  const src = new URL(tab.url).searchParams.get('file');
  if (!src) return;
  $('native').style.display = 'block';
  $('native').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'native', url: src, tabId: tab.id });
    window.close();
  });
});
