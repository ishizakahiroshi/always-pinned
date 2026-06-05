import {
  getSettings,
  removeWindowOverride,
  addManuallyUnpinned,
  removeManuallyUnpinned,
  clearManuallyUnpinned
} from './storage.js';

const LOG_PREFIX = '[Always Pinned]';

function debug(message, error) {
  console.debug(`${LOG_PREFIX} ${message}`, error);
}

function runAsync(label, task) {
  Promise.resolve()
    .then(task)
    .catch(error => debug(`${label} failed`, error));
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

function isNewTabUrl(url) {
  return !url || url === 'chrome://newtab/' || url === 'about:blank';
}

async function pinTabsInWindow(windowId) {
  const { skipNewTab, respectManualUnpin, manuallyUnpinned, enabled, windowOverrides } = await getSettings();
  const key = String(windowId);
  const isEnabled = key in windowOverrides ? windowOverrides[key] : enabled;
  if (!isEnabled) return;

  const tabs = await chrome.tabs.query({ pinned: false, windowId });
  await Promise.all(tabs.map(async tab => {
    if (respectManualUnpin && manuallyUnpinned.includes(tab.id)) return;
    if (skipNewTab && isNewTabUrl(tab.url || tab.pendingUrl)) return;
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

// --- badge ---

// グローバル既定 badge（タブ個別設定が無いタブのフォールバック）
async function updateGlobalBadge() {
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  await chrome.action.setBadgeText({ text: enabled ? '' : 'OFF' });
  await chrome.action.setBadgeBackgroundColor({ color: enabled ? '#1a73e8' : '#888888' });
}

// 指定タブに、所属ウィンドウの実効状態（override 反映）を badge として表示
async function updateBadgeForTab(tabId, windowId) {
  const isEnabled = await getWindowEnabled(windowId);
  await chrome.action.setBadgeText({ text: isEnabled ? '' : 'OFF', tabId });
  await chrome.action.setBadgeBackgroundColor({ color: isEnabled ? '#1a73e8' : '#888888', tabId });
}

// 指定ウィンドウのアクティブタブの badge を更新
async function refreshWindowBadge(windowId) {
  const [activeTab] = await chrome.tabs.query({ active: true, windowId });
  if (activeTab) await updateBadgeForTab(activeTab.id, windowId);
}

// 現在フォーカス中のウィンドウのアクティブタブの badge を更新
async function refreshFocusedBadge() {
  const win = await chrome.windows.getLastFocused();
  if (win && win.id != null) await refreshWindowBadge(win.id);
}

chrome.tabs.onCreated.addListener(tab => {
  runAsync('tabs.onCreated', async () => {
    const { skipNewTab, respectManualUnpin, manuallyUnpinned } = await getSettings();
    if (!await getWindowEnabled(tab.windowId)) return;
    if (respectManualUnpin && manuallyUnpinned.includes(tab.id)) return;
    if (skipNewTab && isNewTabUrl(tab.url || tab.pendingUrl)) return;
    await updateTabPinned(tab.id, true, 'pin tab');
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  runAsync('tabs.onUpdated', async () => {
    // onUpdated はイベントフィルタ非対応で全更新（favicon/title/status 等）で発火する。
    // ピン状態と URL 変化以外は早期 return して無駄な処理を避ける。
    if (changeInfo.pinned === undefined && !changeInfo.url) return;

    // ユーザーが再度ピン留めしたタブは、手動解除リストから戻す。
    if (changeInfo.pinned === true) {
      await removeManuallyUnpinned(tabId);
      return;
    }

    // ユーザーが手動でピン解除した
    if (changeInfo.pinned === false) {
      if (!await getWindowEnabled(tab.windowId)) return;
      const { respectManualUnpin } = await getSettings();
      if (respectManualUnpin) {
        await addManuallyUnpinned(tabId);
      } else {
        await updateTabPinned(tabId, true, 'repin tab');
      }
      return;
    }

    // URL変化: 新規タブから実URLに遷移したらピン留め
    if (changeInfo.url && !tab.pinned) {
      const { respectManualUnpin, manuallyUnpinned } = await getSettings();
      if (respectManualUnpin && manuallyUnpinned.includes(tabId)) return;
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

// badge: アクティブタブ / ウィンドウフォーカスの変化で実効状態を反映
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  runAsync('tabs.onActivated', () => updateBadgeForTab(tabId, windowId));
});

chrome.windows.onFocusChanged.addListener(windowId => {
  runAsync('windows.onFocusChanged', async () => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) return;
    await refreshWindowBadge(windowId);
  });
});

chrome.runtime.onInstalled.addListener(() => {
  runAsync('runtime.onInstalled', async () => {
    // 旧バージョンが local に残した一時キーを掃除（session へ移行済み）
    await chrome.storage.local.remove(['windowOverrides', 'manuallyUnpinned']);
    await pinAllWindows();
    await updateGlobalBadge();
    await refreshFocusedBadge();
  });
});

chrome.runtime.onStartup.addListener(() => {
  runAsync('runtime.onStartup', async () => {
    // windowOverrides / manuallyUnpinned は session のため再起動で自動クリア済み（手動クリア不要）
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
        await clearManuallyUnpinned();
        await pinAllWindows();
        return;
      }
      if ('skipNewTab' in changes && !changes.skipNewTab.newValue) {
        await pinAllWindows();
      }
    } else if (areaName === 'session' && 'windowOverrides' in changes) {
      // ウィンドウ override の変更を badge へ即時反映
      await refreshFocusedBadge();
    }
  });
});

runAsync('initial badge update', async () => {
  await updateGlobalBadge();
  await refreshFocusedBadge();
});
