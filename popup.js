import {
  getSettings,
  setWindowOverride,
  removeWindowOverride,
  removeManuallyUnpinned
} from './storage.js';

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
  closeTab: 'Close tab',
  manuallyUnpinnedHint: 'Manually unpinned (will not be re-pinned)',
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
    closeTab: 'タブを閉じる',
    manuallyUnpinnedHint: '手動で解除（再ピンしません）',
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
  // a11y: トグル等の input には aria-label を別属性で設定する
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    const key = el.dataset.i18nAria;
    if (t[key]) {
      el.setAttribute('aria-label', t[key]);
    }
  });
}

function buildTabList(tabs, manuallyUnpinned) {
  tabListEl.innerHTML = '';
  if (!tabs.length) {
    tabListEl.innerHTML = `<div style="padding:8px;font-size:11px;color:#aaa;text-align:center">${t.noTabs}</div>`;
    return;
  }
  const manuallyUnpinnedSet = new Set(manuallyUnpinned);
  tabs.forEach(tab => {
    const item = document.createElement('div');
    item.className = 'tab-item';

    // favicon（装飾画像なので alt は空にする）
    if (tab.favIconUrl) {
      const img = document.createElement('img');
      img.className = 'favicon';
      img.src = tab.favIconUrl;
      img.alt = '';
      img.onerror = () => {
        img.replaceWith(makeFallbackFavicon());
      };
      item.appendChild(img);
    } else {
      item.appendChild(makeFallbackFavicon());
    }

    // title（手動解除タブは視覚的に区別し、ツールチップで理由を示す）
    const isManuallyUnpinned = manuallyUnpinnedSet.has(tab.id);
    const titleEl = document.createElement('span');
    titleEl.className = 'tab-title'
      + (tab.pinned ? '' : ' unpinned')
      + (isManuallyUnpinned ? ' manually-unpinned' : '');
    titleEl.textContent = tab.title || tab.url || t.loadingTitle;
    const baseTitle = tab.title || tab.url || '';
    titleEl.title = isManuallyUnpinned
      ? `${baseTitle}\n${t.manuallyUnpinnedHint}`
      : baseTitle;
    item.appendChild(titleEl);

    // close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.textContent = '×';
    closeBtn.dataset.tabId = tab.id;
    closeBtn.title = t.closeTab;
    closeBtn.setAttribute('aria-label', t.closeTab);
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
  const overrideKey = String(currentWindowId);
  const hasOverride = overrideKey in windowOverrides;
  const windowEnabled = hasOverride ? windowOverrides[overrideKey] : enabled;

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
  await chrome.tabs.remove(parseInt(btn.dataset.tabId, 10));
  refreshStatus();
});

// このウィンドウトグル
toggle.addEventListener('change', async () => {
  await setWindowOverride(currentWindowId, toggle.checked);
  if (toggle.checked) {
    const tabs = await chrome.tabs.query({ pinned: false, windowId: currentWindowId });
    await Promise.all(tabs.map(t => chrome.tabs.update(t.id, { pinned: true }).catch(e => console.debug('[Always Pinned] pin failed', e))));
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
  await removeWindowOverride(currentWindowId);
  refreshStatus();
});

// 全ピン留め（手動解除リストからも削除）
document.getElementById('btn-pin-all').addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ windowId: currentWindowId });
  await removeManuallyUnpinned(tabs.map(t => t.id));
  await Promise.all(tabs.filter(t => !t.pinned).map(t => chrome.tabs.update(t.id, { pinned: true }).catch(e => console.debug('[Always Pinned] pin failed', e))));
  refreshStatus();
});

// 全解除
document.getElementById('btn-unpin-all').addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ pinned: true, windowId: currentWindowId });
  await Promise.all(tabs.map(t => chrome.tabs.update(t.id, { pinned: false }).catch(e => console.debug('[Always Pinned] unpin failed', e))));
  refreshStatus();
});
