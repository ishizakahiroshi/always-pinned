import {
  getSettings,
  setWindowOverride,
  removeWindowOverride,
  addManuallyUnpinned,
  removeManuallyUnpinned
} from './storage.js';
import { shouldAutoPinTab } from './utils.js';

const toggle           = document.getElementById('toggle');
const toggleGlobal     = document.getElementById('toggle-global');
const toggleSkipNewTab = document.getElementById('toggle-skip-newtab');
const toggleRespect    = document.getElementById('toggle-respect-unpin');
const overrideTag      = document.getElementById('override-tag');
const btnReset         = document.getElementById('btn-reset');
const tabListEl        = document.getElementById('tab-list');
const statusEl         = document.getElementById('status');
const heroMainEl       = document.getElementById('hero-main');
const heroSubEl        = document.getElementById('hero-sub');
const windowPillEl     = document.getElementById('window-pill');
const tabFilterEl      = document.getElementById('tab-filter');
const filterMetaEl     = document.getElementById('filter-meta');

let currentWindowId;
let controlsReady = false;
let actionDepth = 0;
let cachedTabs = [];
let cachedManuallyUnpinned = [];
let filterQuery = '';
let statusFeedbackTimer = null;
let lastStatusLine = '';
const LOG_PREFIX = '[Always Pinned]';
const STATUS_FEEDBACK_MS = 2500;
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
  sectionPresets: 'Presets',
  excludeNewTabs: 'Exclude New Tabs',
  excludeNewTabsHelp: 'Empty new tabs stay unpinned until they get a real URL.',
  respectManualUnpin: 'Respect Manual Unpin',
  respectManualUnpinHelp: 'Tabs you unpin by hand stay free until you Pin All again.',
  noteResetOnRestart: 'Window overrides and manual-unpin list are reset when the browser restarts.',
  noTabs: 'No tabs',
  noFilterMatch: 'No matching tabs',
  loadingTitle: '(Loading)',
  closeTab: 'Close tab',
  pinTab: 'Pin tab',
  unpinTabKeepFree: 'Unpin and keep free from re-pin',
  restorePinTarget: 'Allow re-pin again',
  manuallyUnpinnedHint: 'Manually unpinned (will not be re-pinned)',
  statusError: 'Action failed. Please try again.',
  statusTabs: (count, pinned) => `Tabs: ${count} (Pinned: ${pinned})`,
  heroPinned: (pinned, total) => `Pinned ${pinned} / ${total}`,
  heroSub: (exceptions, skipOn) => {
    const parts = [];
    if (exceptions > 0) parts.push(`Exceptions: ${exceptions}`);
    if (skipOn) parts.push('Exclude new tabs: ON');
    return parts.join(' · ');
  },
  windowOn: 'Window ON',
  windowOff: 'Window OFF',
  filterPlaceholder: 'Filter tabs...',
  filterMeta: (shown, total) => (shown === total ? '' : `Showing ${shown} / ${total}`),
  presetLock: 'Lock tight',
  presetSoft: 'Soft pin',
  presetHint: 'Lock tight = re-pin hard · Soft pin = skip new tabs + respect manual unpin',
  openShortcuts: 'Set keyboard shortcut…',
  feedbackPinAll: (n) => `Pinned ${n} tab(s)`,
  feedbackUnpinAll: (n) => `Window OFF · unpinned ${n} tab(s)`,
  feedbackWindowOn: 'This window is ON',
  feedbackWindowOff: 'This window is OFF',
  feedbackPresetLock: 'Preset: Lock tight',
  feedbackPresetSoft: 'Preset: Soft pin',
  feedbackException: 'Tab kept unpinned',
  feedbackRestored: 'Tab can be re-pinned',
  feedbackPinned: 'Tab pinned'
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
  sectionPresets: 'プリセット',
  excludeNewTabs: '新規タブを除外',
  excludeNewTabsHelp: '空の新規タブは URL が付くまでピンしません',
  respectManualUnpin: '手動解除を尊重',
  respectManualUnpinHelp: '手で外したタブは、全ピン留めするまで戻しません',
  noteResetOnRestart: '※ ウィンドウ設定・手動解除リストはブラウザ再起動時にリセット',
  noTabs: 'タブなし',
  noFilterMatch: '一致するタブなし',
  loadingTitle: '(読込中)',
  closeTab: 'タブを閉じる',
  pinTab: 'ピン留め',
  unpinTabKeepFree: '解除して再ピンしない',
  restorePinTarget: '再ピン対象に戻す',
  manuallyUnpinnedHint: '手動で解除（再ピンしません）',
  statusError: '操作に失敗しました。もう一度お試しください。',
  statusTabs: (count, pinned) => `タブ: ${count}件 (ピン留め: ${pinned}件)`,
  heroPinned: (pinned, total) => `ピン ${pinned} / ${total}`,
  heroSub: (exceptions, skipOn) => {
    const parts = [];
    if (exceptions > 0) parts.push(`例外 ${exceptions}`);
    if (skipOn) parts.push('新規タブ除外: ON');
    return parts.join(' · ');
  },
  windowOn: 'この窓 ON',
  windowOff: 'この窓 OFF',
  filterPlaceholder: 'タブを絞り込み...',
  filterMeta: (shown, total) => (shown === total ? '' : `表示 ${shown} / ${total}`),
  presetLock: 'がっちり',
  presetSoft: 'やさしく',
  presetHint: 'がっちり=再ピン強制 · やさしく=新規除外+手動解除を尊重',
  openShortcuts: 'キーボードショートカットを設定…',
  feedbackPinAll: (n) => `${n} 件をピン留めしました`,
  feedbackUnpinAll: (n) => `この窓を OFF · ${n} 件を解除`,
  feedbackWindowOn: 'このウィンドウを ON にしました',
  feedbackWindowOff: 'このウィンドウを OFF にしました',
  feedbackPresetLock: 'プリセット: がっちり',
  feedbackPresetSoft: 'プリセット: やさしく',
  feedbackException: 'タブを例外にしました',
  feedbackRestored: '再ピン対象に戻しました',
  feedbackPinned: 'ピン留めしました'
};
const t = locale === 'ja' ? { ...enMessages, ...jaOverrides } : enMessages;

function debug(message, error) {
  console.debug(`${LOG_PREFIX} ${message}`, error);
}

function setControlsDisabled(disabled) {
  document.querySelectorAll('button, input').forEach(control => {
    control.disabled = disabled;
  });
}

function updateControlsAvailability() {
  setControlsDisabled(!controlsReady || actionDepth > 0);
}

function setStatusLine(text, { feedback = false } = {}) {
  statusEl.textContent = text;
  statusEl.classList.toggle('feedback', feedback);
}

function showStatusFeedback(message) {
  if (statusFeedbackTimer) {
    clearTimeout(statusFeedbackTimer);
    statusFeedbackTimer = null;
  }
  setStatusLine(message, { feedback: true });
  statusFeedbackTimer = setTimeout(() => {
    statusFeedbackTimer = null;
    setStatusLine(lastStatusLine, { feedback: false });
  }, STATUS_FEEDBACK_MS);
}

function runAction(label, task) {
  actionDepth += 1;
  updateControlsAvailability();
  Promise.resolve()
    .then(task)
    .catch(async error => {
      debug(`${label} failed`, error);
      if (label !== 'refresh status') {
        try {
          await refreshStatus();
        } catch (refreshError) {
          debug('refresh after error failed', refreshError);
        }
      }
      if (statusFeedbackTimer) {
        clearTimeout(statusFeedbackTimer);
        statusFeedbackTimer = null;
      }
      setStatusLine(t.statusError, { feedback: false });
    })
    .finally(() => {
      actionDepth = Math.max(0, actionDepth - 1);
      updateControlsAvailability();
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
    if (typeof t[key] === 'string') {
      el.textContent = t[key];
    }
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    const key = el.dataset.i18nAria;
    if (typeof t[key] === 'string') {
      el.setAttribute('aria-label', t[key]);
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (typeof t[key] === 'string') {
      el.setAttribute('placeholder', t[key]);
    }
  });
}

function getSafeFaviconUrl(favIconUrl) {
  if (!favIconUrl) return '';

  try {
    const url = new URL(favIconUrl);
    if (url.protocol === 'https:' || url.protocol === 'http:') return favIconUrl;
    if (url.protocol === 'data:' && /^data:image\//i.test(favIconUrl)) return favIconUrl;
    if (url.protocol === 'chrome:') return favIconUrl;
    if (url.protocol === 'chrome-extension:' && url.hostname === chrome.runtime.id) return favIconUrl;
  } catch {
    // Invalid or relative favicon URLs are ignored.
  }
  return '';
}

/** 現在ウィンドウの未ピンタブを、skipNewTab / 例外リストを尊重してピン留めする */
async function pinEligibleTabsInCurrentWindow() {
  if (currentWindowId == null) return;
  const settings = await getSettings();
  const tabs = await chrome.tabs.query({ pinned: false, windowId: currentWindowId });
  await Promise.all(
    tabs
      .filter(tab => shouldAutoPinTab(tab, settings))
      .map(tab => updateTabPinned(tab.id, true, 'pin tab'))
  );
}

function tabMatchesFilter(tab, query) {
  if (!query) return true;
  const hay = `${tab.title || ''} ${tab.url || ''}`.toLowerCase();
  return hay.includes(query);
}

function renderTabList() {
  tabListEl.innerHTML = '';
  const query = filterQuery.trim().toLowerCase();
  const visible = cachedTabs.filter(tab => tabMatchesFilter(tab, query));
  filterMetaEl.textContent = cachedTabs.length
    ? t.filterMeta(visible.length, cachedTabs.length)
    : '';

  if (!cachedTabs.length) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.textContent = t.noTabs;
    tabListEl.appendChild(emptyState);
    return;
  }
  if (!visible.length) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.textContent = t.noFilterMatch;
    tabListEl.appendChild(emptyState);
    return;
  }

  const manuallyUnpinnedSet = new Set(cachedManuallyUnpinned);
  visible.forEach(tab => {
    const item = document.createElement('div');
    item.className = 'tab-item';

    const faviconUrl = getSafeFaviconUrl(tab.favIconUrl);
    if (faviconUrl) {
      const img = document.createElement('img');
      img.className = 'favicon';
      img.src = faviconUrl;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => {
        img.replaceWith(makeFallbackFavicon());
      };
      item.appendChild(img);
    } else {
      item.appendChild(makeFallbackFavicon());
    }

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

    const pinBtn = document.createElement('button');
    pinBtn.type = 'button';
    pinBtn.className = 'icon-btn pin-btn';
    pinBtn.dataset.tabId = String(tab.id);
    if (isManuallyUnpinned) {
      pinBtn.textContent = '+';
      pinBtn.dataset.action = 'restore';
      pinBtn.title = t.restorePinTarget;
      pinBtn.setAttribute('aria-label', t.restorePinTarget);
    } else if (tab.pinned) {
      pinBtn.textContent = 'P';
      pinBtn.dataset.action = 'except';
      pinBtn.title = t.unpinTabKeepFree;
      pinBtn.setAttribute('aria-label', t.unpinTabKeepFree);
    } else {
      pinBtn.textContent = 'P';
      pinBtn.dataset.action = 'pin';
      pinBtn.title = t.pinTab;
      pinBtn.setAttribute('aria-label', t.pinTab);
    }
    item.appendChild(pinBtn);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'icon-btn close-btn';
    closeBtn.textContent = '×';
    closeBtn.dataset.tabId = String(tab.id);
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

function updateHero({ windowEnabled, tabs, manuallyUnpinned, skipNewTab }) {
  const pinned = tabs.filter(tab => tab.pinned).length;
  const exceptions = tabs.filter(tab => manuallyUnpinned.includes(tab.id)).length;
  heroMainEl.textContent = t.heroPinned(pinned, tabs.length);
  heroSubEl.textContent = t.heroSub(exceptions, skipNewTab);
  windowPillEl.textContent = windowEnabled ? t.windowOn : t.windowOff;
  windowPillEl.classList.toggle('off', !windowEnabled);
}

async function refreshStatus({ keepFeedback = false } = {}) {
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
  cachedTabs = tabs;
  cachedManuallyUnpinned = Array.isArray(manuallyUnpinned) ? manuallyUnpinned : [];
  renderTabList();
  updateHero({ windowEnabled, tabs, manuallyUnpinned: cachedManuallyUnpinned, skipNewTab });

  const pinned = tabs.filter(tab => tab.pinned).length;
  lastStatusLine = t.statusTabs(tabs.length, pinned);
  if (!keepFeedback || !statusFeedbackTimer) {
    setStatusLine(lastStatusLine, { feedback: false });
  }
  controlsReady = true;
}

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();
  runAction('refresh status', () => refreshStatus());
});

updateControlsAvailability();

tabFilterEl.addEventListener('input', () => {
  filterQuery = tabFilterEl.value || '';
  renderTabList();
});

tabListEl.addEventListener('click', e => {
  const closeBtn = e.target.closest('.close-btn');
  if (closeBtn) {
    runAction('close tab', async () => {
      const tabId = Number.parseInt(closeBtn.dataset.tabId, 10);
      if (!Number.isInteger(tabId)) return;
      await chrome.tabs.remove(tabId);
      await refreshStatus();
    });
    return;
  }

  const pinBtn = e.target.closest('.pin-btn');
  if (!pinBtn) return;
  const tabId = Number.parseInt(pinBtn.dataset.tabId, 10);
  if (!Number.isInteger(tabId)) return;
  const action = pinBtn.dataset.action;

  runAction(`tab pin action ${action}`, async () => {
    if (action === 'except') {
      // 例外リストへ先に入れてから解除（respect OFF でも onUpdated が即再ピンしない）
      await addManuallyUnpinned(tabId);
      await updateTabPinned(tabId, false, 'unpin tab keep free');
      await refreshStatus({ keepFeedback: true });
      showStatusFeedback(t.feedbackException);
      return;
    }
    if (action === 'restore') {
      await removeManuallyUnpinned(tabId);
      // 明示復帰: この窓が ON ならすぐピン（ユーザー意図）
      if (toggle.checked) {
        await updateTabPinned(tabId, true, 'repin restored tab');
      }
      await refreshStatus({ keepFeedback: true });
      showStatusFeedback(t.feedbackRestored);
      return;
    }
    if (action === 'pin') {
      await removeManuallyUnpinned(tabId);
      await updateTabPinned(tabId, true, 'pin tab');
      await refreshStatus({ keepFeedback: true });
      showStatusFeedback(t.feedbackPinned);
    }
  });
});

toggle.addEventListener('change', () => {
  runAction('toggle window', async () => {
    await setWindowOverride(currentWindowId, toggle.checked);
    if (toggle.checked) {
      await pinEligibleTabsInCurrentWindow();
    }
    await refreshStatus({ keepFeedback: true });
    showStatusFeedback(toggle.checked ? t.feedbackWindowOn : t.feedbackWindowOff);
  });
});

toggleGlobal.addEventListener('change', () => {
  runAction('toggle global', async () => {
    await chrome.storage.local.set({ enabled: toggleGlobal.checked });
    await refreshStatus();
  });
});

toggleSkipNewTab.addEventListener('change', () => {
  runAction('toggle skip new tab', async () => {
    await chrome.storage.local.set({ skipNewTab: toggleSkipNewTab.checked });
    await refreshStatus();
  });
});

toggleRespect.addEventListener('change', () => {
  runAction('toggle respect manual unpin', async () => {
    await chrome.storage.local.set({ respectManualUnpin: toggleRespect.checked });
    await refreshStatus();
  });
});

btnReset.addEventListener('click', () => {
  runAction('reset window override', async () => {
    await removeWindowOverride(currentWindowId);
    const { enabled } = await getSettings();
    if (enabled) {
      await pinEligibleTabsInCurrentWindow();
    }
    await refreshStatus();
  });
});

document.getElementById('btn-preset-lock').addEventListener('click', () => {
  runAction('preset lock tight', async () => {
    await chrome.storage.local.set({ skipNewTab: false, respectManualUnpin: false });
    await refreshStatus({ keepFeedback: true });
    showStatusFeedback(t.feedbackPresetLock);
  });
});

document.getElementById('btn-preset-soft').addEventListener('click', () => {
  runAction('preset soft pin', async () => {
    await chrome.storage.local.set({ skipNewTab: true, respectManualUnpin: true });
    await refreshStatus({ keepFeedback: true });
    showStatusFeedback(t.feedbackPresetSoft);
  });
});

document.getElementById('btn-pin-all').addEventListener('click', () => {
  runAction('pin all tabs', async () => {
    const tabs = await chrome.tabs.query({ windowId: currentWindowId });
    await removeManuallyUnpinned(tabs.map(tab => tab.id));
    const unpinned = tabs.filter(tab => !tab.pinned);
    await Promise.all(unpinned.map(tab => updateTabPinned(tab.id, true, 'pin tab')));
    await refreshStatus({ keepFeedback: true });
    showStatusFeedback(t.feedbackPinAll(unpinned.length));
  });
});

document.getElementById('btn-unpin-all').addEventListener('click', () => {
  runAction('unpin all tabs', async () => {
    await setWindowOverride(currentWindowId, false);
    const tabs = await chrome.tabs.query({ pinned: true, windowId: currentWindowId });
    await Promise.all(tabs.map(tab => updateTabPinned(tab.id, false, 'unpin tab')));
    await refreshStatus({ keepFeedback: true });
    showStatusFeedback(t.feedbackUnpinAll(tabs.length));
  });
});

document.getElementById('btn-shortcuts').addEventListener('click', () => {
  runAction('open shortcuts', async () => {
    try {
      await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    } catch (error) {
      debug('open shortcuts failed', error);
      throw error;
    }
  });
});
