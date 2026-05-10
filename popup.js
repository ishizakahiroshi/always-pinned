const toggle           = document.getElementById('toggle');
const toggleGlobal     = document.getElementById('toggle-global');
const toggleSkipNewTab = document.getElementById('toggle-skip-newtab');
const toggleRespect    = document.getElementById('toggle-respect-unpin');
const overrideTag      = document.getElementById('override-tag');
const btnReset         = document.getElementById('btn-reset');
const tabListEl        = document.getElementById('tab-list');
const statusEl         = document.getElementById('status');

let currentWindowId;
const locale = (navigator.language || 'en').toLowerCase().startsWith('ja') ? 'ja' : 'en';
const enMessages = {
  sectionCurrentWindow: 'This Window',
  forcePinningCurrent: 'Pin This Window',
  forcePinningDefault: 'Pin New Windows by Default',
  defaultTag: 'Default',
  windowOverrideTag: 'Override',
  resetButton: '× Reset',
  pinAll: '▶ Pin All',
  unpinAll: '✕ Unpin All',
  loading: 'Loading...',
  sectionDefaultSettings: 'Default Settings',
  excludeNewTabs: 'Exclude New Tabs',
  respectManualUnpin: 'Respect Manual Unpin',
  noteResetOnRestart: 'Window overrides and manual-unpin list are reset when the browser restarts.',
  noTabs: 'No tabs',
  loadingTitle: '(Loading)',
  statusTabs: (count, pinned) => `Tabs: ${count} (Pinned: ${pinned})`
};
const jaOverrides = {
    sectionCurrentWindow: 'このウィンドウ',
    forcePinningCurrent: 'このウィンドウでピン留め',
    forcePinningDefault: '新しいウィンドウで既定ON',
    defaultTag: '既定値',
    windowOverrideTag: '個別設定',
    resetButton: '× リセット',
    pinAll: '▶ 全ピン留め',
    unpinAll: '✕ 全解除',
    loading: '読み込み中...',
    sectionDefaultSettings: '既定値設定',
    excludeNewTabs: '新規タブを除外',
    respectManualUnpin: '手動解除を尊重',
    noteResetOnRestart: '※ ウィンドウ設定・手動解除リストはブラウザ再起動時にリセット',
    noTabs: 'タブなし',
    loadingTitle: '(読込中)',
    statusTabs: (count, pinned) => `タブ: ${count}件 (ピン留め: ${pinned}件)`
};
const t = locale === 'ja' ? { ...enMessages, ...jaOverrides } : enMessages;

function applyI18n() {
  document.documentElement.lang = locale;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (t[key]) {
      el.textContent = t[key];
    }
  });
}

async function getSettings() {
  return chrome.storage.local.get({
    enabled: true,
    windowOverrides: {},
    skipNewTab: true,
    respectManualUnpin: true,
    manuallyUnpinned: []
  });
}

function buildTabList(tabs, manuallyUnpinned) {
  tabListEl.innerHTML = '';
  if (!tabs.length) {
    tabListEl.innerHTML = `<div style="padding:8px;font-size:11px;color:#aaa;text-align:center">${t.noTabs}</div>`;
    return;
  }
  tabs.forEach(tab => {
    const item = document.createElement('div');
    item.className = 'tab-item';

    // favicon
    if (tab.favIconUrl) {
      const img = document.createElement('img');
      img.className = 'favicon';
      img.src = tab.favIconUrl;
      img.onerror = () => {
        img.replaceWith(makeFallbackFavicon());
      };
      item.appendChild(img);
    } else {
      item.appendChild(makeFallbackFavicon());
    }

    // title
    const titleEl = document.createElement('span');
    titleEl.className = 'tab-title' + (tab.pinned ? '' : ' unpinned');
    titleEl.textContent = tab.title || tab.url || t.loadingTitle;
    titleEl.title = tab.title || tab.url || '';
    item.appendChild(titleEl);

    // close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.textContent = '×';
    closeBtn.dataset.tabId = tab.id;
    item.appendChild(closeBtn);

    tabListEl.appendChild(item);
  });
}

function makeFallbackFavicon() {
  const el = document.createElement('div');
  el.className = 'favicon-fallback';
  return el;
}

async function refreshStatus() {
  const win = await chrome.windows.getCurrent();
  currentWindowId = win.id;

  const { enabled, windowOverrides, skipNewTab, respectManualUnpin, manuallyUnpinned } = await getSettings();
  const hasOverride = currentWindowId in windowOverrides;
  const windowEnabled = hasOverride ? windowOverrides[currentWindowId] : enabled;

  toggle.checked         = windowEnabled;
  toggleGlobal.checked   = enabled;
  toggleSkipNewTab.checked = skipNewTab;
  toggleRespect.checked  = respectManualUnpin;

  if (hasOverride) {
    overrideTag.textContent = t.windowOverrideTag;
    overrideTag.className = 'tag';
    btnReset.style.display = 'inline';
  } else {
    overrideTag.textContent = t.defaultTag;
    overrideTag.className = 'tag default';
    btnReset.style.display = 'none';
  }

  const tabs = await chrome.tabs.query({ windowId: currentWindowId });
  buildTabList(tabs, manuallyUnpinned);

  const pinned = tabs.filter(t => t.pinned).length;
  statusEl.textContent = t.statusTabs(tabs.length, pinned);
}

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();
  refreshStatus();
});

// タブ一覧の × ボタン
tabListEl.addEventListener('click', async e => {
  const btn = e.target.closest('.close-btn');
  if (!btn) return;
  await chrome.tabs.remove(parseInt(btn.dataset.tabId));
  refreshStatus();
});

// このウィンドウトグル
toggle.addEventListener('change', async () => {
  const { windowOverrides } = await getSettings();
  windowOverrides[currentWindowId] = toggle.checked;
  await chrome.storage.local.set({ windowOverrides });
  if (toggle.checked) {
    const tabs = await chrome.tabs.query({ pinned: false, windowId: currentWindowId });
    await Promise.all(tabs.map(t => chrome.tabs.update(t.id, { pinned: true }).catch(() => {})));
  }
  refreshStatus();
});

// 既定値トグル
toggleGlobal.addEventListener('change', async () => {
  await chrome.storage.local.set({ enabled: toggleGlobal.checked });
  refreshStatus();
});

// 新規タブを除外
toggleSkipNewTab.addEventListener('change', async () => {
  await chrome.storage.local.set({ skipNewTab: toggleSkipNewTab.checked });
  refreshStatus();
});

// 手動解除を尊重
toggleRespect.addEventListener('change', async () => {
  await chrome.storage.local.set({ respectManualUnpin: toggleRespect.checked });
  refreshStatus();
});

// リセット（ウィンドウ個別設定を削除）
btnReset.addEventListener('click', async () => {
  const { windowOverrides } = await getSettings();
  delete windowOverrides[currentWindowId];
  await chrome.storage.local.set({ windowOverrides });
  refreshStatus();
});

// 全ピン留め（手動解除リストからも削除）
document.getElementById('btn-pin-all').addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ windowId: currentWindowId });
  const tabIds = tabs.map(t => t.id);
  const { manuallyUnpinned } = await getSettings();
  await chrome.storage.local.set({ manuallyUnpinned: manuallyUnpinned.filter(id => !tabIds.includes(id)) });
  await Promise.all(tabs.filter(t => !t.pinned).map(t => chrome.tabs.update(t.id, { pinned: true }).catch(() => {})));
  refreshStatus();
});

// 全解除
document.getElementById('btn-unpin-all').addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ pinned: true, windowId: currentWindowId });
  await Promise.all(tabs.map(t => chrome.tabs.update(t.id, { pinned: false }).catch(() => {})));
  refreshStatus();
});
