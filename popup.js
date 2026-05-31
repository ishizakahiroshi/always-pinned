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
const LOG_PREFIX = '[Always Pinned]';
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
  statusError: 'Action failed. Please try again.',
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
    statusError: '操作に失敗しました。もう一度お試しください。',
    statusTabs: (count, pinned) => `タブ: ${count}件 (ピン留め: ${pinned}件)`
};
const t = locale === 'ja' ? { ...enMessages, ...jaOverrides } : enMessages;

function debug(message, error) {
  console.debug(`${LOG_PREFIX} ${message}`, error);
}

function runAction(label, task) {
  Promise.resolve()
    .then(task)
    .catch(error => {
      debug(`${label} failed`, error);
      statusEl.textContent = t.statusError;
    });
}

async function updateTabPinned(tabId, pinned, label) {
  if (tabId == null) return;
  try {
    await chrome.tabs.update(tabId, { pinned });
  } catch (error) {
    debug(`${label} failed`, error);
  }
}

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
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.textContent = t.noTabs;
    tabListEl.appendChild(emptyState);
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
  runAction('refresh status', refreshStatus);
});

// タブ一覧の × ボタン
tabListEl.addEventListener('click', e => {
  const btn = e.target.closest('.close-btn');
  if (!btn) return;
  runAction('close tab', async () => {
    await chrome.tabs.remove(Number.parseInt(btn.dataset.tabId, 10));
    await refreshStatus();
  });
});

// このウィンドウトグル
toggle.addEventListener('change', () => {
  runAction('toggle window', async () => {
    await setWindowOverride(currentWindowId, toggle.checked);
    if (toggle.checked) {
      const tabs = await chrome.tabs.query({ pinned: false, windowId: currentWindowId });
      await Promise.all(tabs.map(tab => updateTabPinned(tab.id, true, 'pin tab')));
    }
    await refreshStatus();
  });
});

// 既定値トグル
toggleGlobal.addEventListener('change', () => {
  runAction('toggle global', async () => {
    await chrome.storage.local.set({ enabled: toggleGlobal.checked });
    await refreshStatus();
  });
});

// 新規タブを除外
toggleSkipNewTab.addEventListener('change', () => {
  runAction('toggle skip new tab', async () => {
    await chrome.storage.local.set({ skipNewTab: toggleSkipNewTab.checked });
    await refreshStatus();
  });
});

// 手動解除を尊重
toggleRespect.addEventListener('change', () => {
  runAction('toggle respect manual unpin', async () => {
    await chrome.storage.local.set({ respectManualUnpin: toggleRespect.checked });
    await refreshStatus();
  });
});

// リセット（ウィンドウ個別設定を削除）
btnReset.addEventListener('click', () => {
  runAction('reset window override', async () => {
    await removeWindowOverride(currentWindowId);
    await refreshStatus();
  });
});

// 全ピン留め（手動解除リストからも削除）
document.getElementById('btn-pin-all').addEventListener('click', () => {
  runAction('pin all tabs', async () => {
    const tabs = await chrome.tabs.query({ windowId: currentWindowId });
    await removeManuallyUnpinned(tabs.map(tab => tab.id));
    await Promise.all(tabs.filter(tab => !tab.pinned).map(tab => updateTabPinned(tab.id, true, 'pin tab')));
    await refreshStatus();
  });
});

// 全解除（強制ピン留めが即座に戻さないよう、このウィンドウを OFF にしてから解除）
document.getElementById('btn-unpin-all').addEventListener('click', () => {
  runAction('unpin all tabs', async () => {
    await setWindowOverride(currentWindowId, false);
    const tabs = await chrome.tabs.query({ pinned: true, windowId: currentWindowId });
    await Promise.all(tabs.map(tab => updateTabPinned(tab.id, false, 'unpin tab')));
    await refreshStatus();
  });
});
