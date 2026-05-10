const toggle           = document.getElementById('toggle');
const toggleGlobal     = document.getElementById('toggle-global');
const toggleSkipNewTab = document.getElementById('toggle-skip-newtab');
const toggleRespect    = document.getElementById('toggle-respect-unpin');
const overrideTag      = document.getElementById('override-tag');
const btnReset         = document.getElementById('btn-reset');
const tabListEl        = document.getElementById('tab-list');
const statusEl         = document.getElementById('status');

let currentWindowId;

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
    tabListEl.innerHTML = '<div style="padding:8px;font-size:11px;color:#aaa;text-align:center">タブなし</div>';
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
    titleEl.textContent = tab.title || tab.url || '(読込中)';
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
    overrideTag.textContent = '個別設定';
    overrideTag.className = 'tag';
    btnReset.style.display = 'inline';
  } else {
    overrideTag.textContent = '既定値';
    overrideTag.className = 'tag default';
    btnReset.style.display = 'none';
  }

  const tabs = await chrome.tabs.query({ windowId: currentWindowId });
  buildTabList(tabs, manuallyUnpinned);

  const pinned = tabs.filter(t => t.pinned).length;
  statusEl.textContent = `タブ: ${tabs.length}件 (ピン留め: ${pinned}件)`;
}

document.addEventListener('DOMContentLoaded', refreshStatus);

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
