import {
  getSettings,
  setWindowOverride,
  removeWindowOverride,
  addManuallyUnpinned,
  removeManuallyUnpinned,
  clearManuallyUnpinned
} from './storage.js';
import { isNewTabUrl, shouldAutoPinTab } from './utils.js';

const LOG_PREFIX = '[Always Pinned]';
const CMD_TOGGLE_WINDOW = 'toggle-window-pin';
const MENU_KEEP_UNPINNED = 'keep-unpinned';
const MENU_RESTORE_PIN = 'restore-pin';

function debug(message, error) {
  console.debug(`${LOG_PREFIX} ${message}`, error);
}

function runAsync(label, task) {
  Promise.resolve()
    .then(task)
    .catch(error => debug(`${label} failed`, error));
}

function uiLangJa() {
  const lang = (chrome.i18n.getUILanguage() || 'en').toLowerCase();
  return lang.startsWith('ja');
}

async function updateTabPinned(tabId, pinned, label) {
  if (tabId == null) return;
  try {
    await chrome.tabs.update(tabId, { pinned });
  } catch (error) {
    debug(`${label} failed`, error);
  }
}

async function getWindowEnabled(windowId) {
  const { enabled, windowOverrides } = await getSettings();
  const key = String(windowId);
  return key in windowOverrides ? windowOverrides[key] : enabled;
}

async function pinTabsInWindow(windowId) {
  const settings = await getSettings();
  const { enabled, windowOverrides } = settings;
  const key = String(windowId);
  const isEnabled = key in windowOverrides ? windowOverrides[key] : enabled;
  if (!isEnabled) return;

  const tabs = await chrome.tabs.query({ pinned: false, windowId });
  await Promise.all(tabs.map(async tab => {
    if (!shouldAutoPinTab(tab, settings)) return;
    await updateTabPinned(tab.id, true, 'pin tab');
  }));
}

async function pinAllWindows() {
  const windows = await chrome.windows.getAll();
  await Promise.all(windows.map(async win => {
    if (win.id == null) return;
    try {
      await pinTabsInWindow(win.id);
    } catch (error) {
      debug(`pin window ${win.id} failed`, error);
    }
  }));
}

async function toggleWindowPin(windowId) {
  if (windowId == null) return;
  const currentlyOn = await getWindowEnabled(windowId);
  if (currentlyOn) {
    await setWindowOverride(windowId, false);
    const tabs = await chrome.tabs.query({ pinned: true, windowId });
    await Promise.all(tabs.map(tab => updateTabPinned(tab.id, false, 'unpin tab via command')));
  } else {
    await setWindowOverride(windowId, true);
    await pinTabsInWindow(windowId);
  }
  await refreshWindowBadge(windowId);
}

async function keepTabUnpinned(tabId, windowId) {
  if (tabId == null) return;
  // 例外リストを先に書いてから解除（respect OFF でも onUpdated が再ピンしない）
  await addManuallyUnpinned(tabId);
  await updateTabPinned(tabId, false, 'keep unpinned');
  if (windowId != null) await refreshWindowBadge(windowId);
}

async function restoreTabPinTarget(tabId, windowId) {
  if (tabId == null) return;
  await removeManuallyUnpinned(tabId);
  if (windowId != null && await getWindowEnabled(windowId)) {
    await updateTabPinned(tabId, true, 'restore pin target');
    await refreshWindowBadge(windowId);
  }
}

async function ensureContextMenus() {
  if (!chrome.contextMenus) return;
  await chrome.contextMenus.removeAll();
  const ja = uiLangJa();
  chrome.contextMenus.create({
    id: MENU_KEEP_UNPINNED,
    title: ja ? 'Always Pinned: このタブは再ピンしない' : 'Always Pinned: Keep this tab unpinned',
    contexts: ['tab']
  });
  chrome.contextMenus.create({
    id: MENU_RESTORE_PIN,
    title: ja ? 'Always Pinned: 再ピン対象に戻す' : 'Always Pinned: Allow re-pin again',
    contexts: ['tab']
  });
}

// --- badge ---

async function updateGlobalBadge() {
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  await chrome.action.setBadgeText({ text: enabled ? '' : 'OFF' });
  await chrome.action.setBadgeBackgroundColor({ color: enabled ? '#1a73e8' : '#888888' });
}

async function updateBadgeForTab(tabId, windowId) {
  const isEnabled = await getWindowEnabled(windowId);
  await chrome.action.setBadgeText({ text: isEnabled ? '' : 'OFF', tabId });
  await chrome.action.setBadgeBackgroundColor({ color: isEnabled ? '#1a73e8' : '#888888', tabId });
}

async function refreshWindowBadge(windowId) {
  const [activeTab] = await chrome.tabs.query({ active: true, windowId });
  if (activeTab) await updateBadgeForTab(activeTab.id, windowId);
}

async function refreshFocusedBadge() {
  const win = await chrome.windows.getLastFocused();
  if (win && win.id != null) await refreshWindowBadge(win.id);
}

chrome.tabs.onCreated.addListener(tab => {
  runAsync('tabs.onCreated', async () => {
    if (!await getWindowEnabled(tab.windowId)) return;
    const settings = await getSettings();
    if (!shouldAutoPinTab(tab, settings)) return;
    await updateTabPinned(tab.id, true, 'pin tab');
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  runAsync('tabs.onUpdated', async () => {
    if (changeInfo.pinned === undefined && !changeInfo.url) return;

    if (changeInfo.pinned === true) {
      await removeManuallyUnpinned(tabId);
      return;
    }

    if (changeInfo.pinned === false) {
      if (!await getWindowEnabled(tab.windowId)) return;
      const { respectManualUnpin, manuallyUnpinned } = await getSettings();
      // 明示例外（行操作・コンテキストメニュー）は respect 設定に関わらず再ピンしない
      if (Array.isArray(manuallyUnpinned) && manuallyUnpinned.includes(tabId)) return;
      if (respectManualUnpin) {
        await addManuallyUnpinned(tabId);
      } else {
        await updateTabPinned(tabId, true, 'repin tab');
      }
      return;
    }

    if (changeInfo.url && !tab.pinned) {
      const settings = await getSettings();
      if (!shouldAutoPinTab(tab, settings)) return;
      if (!isNewTabUrl(changeInfo.url) && await getWindowEnabled(tab.windowId)) {
        await updateTabPinned(tabId, true, 'pin tab on url change');
      }
    }
  });
});

chrome.tabs.onRemoved.addListener(tabId => {
  runAsync('tabs.onRemoved', () => removeManuallyUnpinned(tabId));
});

chrome.windows.onRemoved.addListener(windowId => {
  runAsync('windows.onRemoved', () => removeWindowOverride(windowId));
});

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  runAsync('tabs.onActivated', () => updateBadgeForTab(tabId, windowId));
});

chrome.windows.onFocusChanged.addListener(windowId => {
  runAsync('windows.onFocusChanged', async () => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) return;
    await refreshWindowBadge(windowId);
  });
});

chrome.commands.onCommand.addListener(command => {
  runAsync('commands.onCommand', async () => {
    if (command !== CMD_TOGGLE_WINDOW) return;
    const win = await chrome.windows.getLastFocused();
    if (!win || win.id == null) return;
    await toggleWindowPin(win.id);
  });
});

if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    runAsync('contextMenus.onClicked', async () => {
      const tabId = tab?.id ?? info.tabId;
      const windowId = tab?.windowId;
      if (tabId == null) return;
      if (info.menuItemId === MENU_KEEP_UNPINNED) {
        await keepTabUnpinned(tabId, windowId);
        return;
      }
      if (info.menuItemId === MENU_RESTORE_PIN) {
        await restoreTabPinTarget(tabId, windowId);
      }
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  runAsync('runtime.onInstalled', async () => {
    await chrome.storage.local.remove(['windowOverrides', 'manuallyUnpinned']);
    await ensureContextMenus();
    await pinAllWindows();
    await updateGlobalBadge();
    await refreshFocusedBadge();
  });
});

chrome.runtime.onStartup.addListener(() => {
  runAsync('runtime.onStartup', async () => {
    await ensureContextMenus();
    await pinAllWindows();
    await updateGlobalBadge();
    await refreshFocusedBadge();
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  runAsync('storage.onChanged', async () => {
    if (areaName === 'local') {
      if ('enabled' in changes) {
        if (changes.enabled.newValue) {
          await clearManuallyUnpinned();
          await pinAllWindows();
        }
        await updateGlobalBadge();
        await refreshFocusedBadge();
        return;
      }
      if ('respectManualUnpin' in changes && !changes.respectManualUnpin.newValue) {
        // respect OFF にしたときは「通常の手動解除記憶」を消す。
        // 明示例外もクリアして強制ピンへ戻す（従来どおり）。
        await clearManuallyUnpinned();
        await pinAllWindows();
        return;
      }
      if ('skipNewTab' in changes && !changes.skipNewTab.newValue) {
        await pinAllWindows();
      }
    } else if (areaName === 'session' && 'windowOverrides' in changes) {
      await refreshFocusedBadge();
    }
  });
});

runAsync('initial sync', async () => {
  await ensureContextMenus();
  await pinAllWindows();
  await updateGlobalBadge();
  await refreshFocusedBadge();
});
