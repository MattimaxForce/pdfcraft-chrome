// PdfCraft for Chrome — service worker (idle until something needs it).
const VIEWER = chrome.runtime.getURL('viewer/viewer.html');
const DEFAULTS = { auto: true, downloads: true, badge: true };
const PDF_URL = /^(https?|file):\/\/[^#?]*\.pdf(?=$|[?#])/i;

const getSettings = async () => ({ ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) });
const viewerUrl = (url, name) =>
  VIEWER + '?file=' + encodeURIComponent(url) + (name ? '&name=' + encodeURIComponent(name) : '');
const baseName = (p) => decodeURIComponent((p.split(/[\\/]/).pop() || '').split(/[?#]/)[0]);

// ---------- DNR rule: plain .pdf URLs are redirected immediately, with no flash of Chrome's viewer ----------
const RULE_ID = 1;
async function syncRule() {
  const { auto } = await getSettings();
  const remove = [RULE_ID];
  const add = auto
    ? [{
        id: RULE_ID,
        priority: 1,
        action: { type: 'redirect', redirect: { regexSubstitution: VIEWER + '?file=\\0' } },
        condition: { regexFilter: '^https?://[^?#&%\\s]+\\.pdf$', resourceTypes: ['main_frame'], isUrlFilterCaseSensitive: false }
      }]
    : [];
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: remove, addRules: add });
}

// ---------- context menu ----------
function buildMenus() {
  chrome.contextMenus.removeAll(() => {
    const pats = ['*://*/*.pdf', '*://*/*.pdf?*', '*://*/*.PDF', 'file:///*.pdf', 'file:///*.PDF'];
    chrome.contextMenus.create({ id: 'link', title: chrome.i18n.getMessage('ctxLink'), contexts: ['link'], targetUrlPatterns: pats });
    chrome.contextMenus.create({ id: 'page', title: chrome.i18n.getMessage('ctxPage'), contexts: ['page'], documentUrlPatterns: pats });
  });
}
chrome.contextMenus.onClicked.addListener((info) => {
  const url = info.menuItemId === 'link' ? info.linkUrl : info.pageUrl;
  if (url) chrome.tabs.create({ url: viewerUrl(url) });
});

chrome.runtime.onInstalled.addListener(() => { buildMenus(); syncRule(); });
chrome.runtime.onStartup.addListener(syncRule);
chrome.storage.onChanged.addListener((c, area) => { if (area === 'sync' && c.auto) syncRule(); });

// ---------- PDFs recognised by Content-Type (even without a .pdf extension) ----------
async function isBypassed(url) {
  const { bypass = [] } = await chrome.storage.session.get('bypass');
  return bypass.includes(url);
}
chrome.webRequest.onHeadersReceived.addListener(
  (d) => {
    if (d.tabId < 0 || d.method !== 'GET' || d.statusCode >= 400) return;
    const h = (n) => (d.responseHeaders || []).find((x) => x.name.toLowerCase() === n)?.value || '';
    if (!/^application\/(x-)?pdf/i.test(h('content-type'))) return;
    if (/^\s*attachment/i.test(h('content-disposition'))) return; // it is a download; downloads.onChanged handles it
    (async () => {
      const s = await getSettings();
      if (await isBypassed(d.url)) return;
      if (s.auto) {
        chrome.tabs.update(d.tabId, { url: viewerUrl(d.url) }).catch(() => {});
      } else if (s.badge) {
        const { pdfTabs = {} } = await chrome.storage.session.get('pdfTabs');
        pdfTabs[d.tabId] = d.url;
        await chrome.storage.session.set({ pdfTabs });
      }
    })();
  },
  { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] },
  ['responseHeaders']
);

// ---------- file:// URLs and the "Open with PdfCraft" badge ----------
chrome.webNavigation.onBeforeNavigate.addListener(
  async (d) => {
    if (d.frameId !== 0 || !/^file:/i.test(d.url) || !PDF_URL.test(d.url)) return;
    if ((await getSettings()).auto && !(await isBypassed(d.url))) chrome.tabs.update(d.tabId, { url: viewerUrl(d.url) }).catch(() => {});
  },
  { url: [{ schemes: ['file'] }] }
);
chrome.webNavigation.onCompleted.addListener(async (d) => {
  if (d.frameId !== 0) return;
  const s = await getSettings();
  if (s.auto || !s.badge) return;
  const { pdfTabs = {} } = await chrome.storage.session.get('pdfTabs');
  if (pdfTabs[d.tabId] !== d.url && !PDF_URL.test(d.url)) return;
  chrome.scripting.executeScript({ target: { tabId: d.tabId }, files: ['badge.js'] }).catch(() => {});
});
chrome.tabs.onRemoved.addListener(async (id) => {
  const { pdfTabs = {} } = await chrome.storage.session.get('pdfTabs');
  if (id in pdfTabs) { delete pdfTabs[id]; await chrome.storage.session.set({ pdfTabs }); }
});

// ---------- downloaded PDFs: open them right away ----------
function fileUrl(path) {
  const p = path.replace(/\\/g, '/');
  return 'file://' + (p.startsWith('/') ? '' : '/') + encodeURI(p).replace(/#/g, '%23').replace(/\?/g, '%3F');
}
chrome.downloads.onChanged.addListener(async (delta) => {
  if (delta.state?.current !== 'complete') return;
  const s = await getSettings();
  if (!s.downloads) return;
  const [item] = await chrome.downloads.search({ id: delta.id });
  if (!item || item.byExtensionId === chrome.runtime.id || /^blob:/i.test(item.url)) return;
  const isPdf = /^application\/(x-)?pdf/i.test(item.mime || '') || /\.pdf$/i.test(item.filename || '');
  if (!isPdf || !item.filename) return;
  const canFile = await chrome.extension.isAllowedFileSchemeAccess();
  const src = canFile ? fileUrl(item.filename) : item.finalUrl || item.url;
  if (!/^(https?|file):/i.test(src)) return;
  chrome.tabs.create({ url: viewerUrl(src, baseName(item.filename)) });
});

// ---------- messages from the badge / popup ----------
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (m?.type === 'open' && m.url) {
    chrome.tabs.create({ url: viewerUrl(m.url), index: sender.tab ? sender.tab.index + 1 : undefined });
  } else if (m?.type === 'native' && m.url && m.tabId != null) {
    // reopen this PDF once in Chrome's built-in viewer
    (async () => {
      const { bypass = [] } = await chrome.storage.session.get('bypass');
      bypass.push(m.url);
      await chrome.storage.session.set({ bypass });
      const esc = m.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      await chrome.declarativeNetRequest.updateSessionRules({
        addRules: [{ id: 1000 + bypass.length, priority: 10, action: { type: 'allow' },
          condition: { regexFilter: '^' + esc + '$', resourceTypes: ['main_frame'] } }]
      });
      chrome.tabs.update(m.tabId, { url: m.url });
    })();
  }
  return false;
});
