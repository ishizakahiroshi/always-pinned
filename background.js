import {
  getSettings,
  removeWindowOverride,
  addManuallyUnpinned,
  removeManuallyUnpinned,
  clearManuallyUnpinned
} from './storage.js';

// popup（非特権コンテキスト）からも session を読めるようにする。
// 一度設定すればブラウザセッション中は維持されるため、SW 起動時に呼んでおく。
chrome.storage.session
  .setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })
  .catch(e => console.debug('[Always Pinned] setAccessLevel failed', e));

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
  await Promise.all(tabs.map(tab => {
    if (respectManualUnpin && manuallyUnpinned.includes(tab.id)) return;
    if (skipNewTab && isNewTabUrl(tab.url || tab.pendingUrl)) return;
    return chrome.tabs.update(tab.id, { pinned: true }).catch(e => console.debug('[Always Pinned] pin failed', e));
  }));
}

async function pinAllWindows() {
  const windows = await chrome.windows.getAll();
  await Promise.all(windows.map(win => pinTabsInWindow(win.id)));
}

// --- badge ---

// グローバル既定 badge（タブ個別設定が無いタブのフォールバック）
async function updateGlobalBadge() {
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  chrome.action.setBadgeText({ text: enabled ? '' : 'OFF' });
  chrome.action.setBadgeBackgroundColor({ color: enabled ? '#1a73e8' : '#888888' });
}

// 指定タブに、所属ウィンドウの実効状態（override 反映）を badge として表示
async function updateBadgeForTab(tabId, windowId) {
  const isEnabled = await getWindowEnabled(windowId);
  chrome.action.setBadgeText({ text: isEnabled ? '' : 'OFF', tabId });
  chrome.action.setBadgeBackgroundColor({ color: isEnabled ? '#1a73e8' : '#888888', tabId });
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

chrome.tabs.onCreated.addListener(async tab => {
  const { skipNewTab, respectManualUnpin, manuallyUnpinned } = await getSettings();
  if (!await getWindowEnabled(tab.windowId)) return;
  if (respectManualUnpin && manuallyUnpinned.includes(tab.id)) return;
  if (skipNewTab && isNewTabUrl(tab.url || tab.pendingUrl)) return;
  chrome.tabs.update(tab.id, { pinned: true }).catch(e => console.debug('[Always Pinned] pin failed', e));
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // onUpdated はイベントフィルタ非対応で全更新（favicon/title/status 等）で発火する。
  // ピン状態と URL 変化以外は早期 return して無駄な処理を避ける。
  if (changeInfo.pinned === undefined && !changeInfo.url) return;

  // ユーザーが手動でピン解除した
  if (changeInfo.pinned === false) {
    const { respectManualUnpin } = await getSettings();
    if (respectManualUnpin) {
      await addManuallyUnpinned(tabId);
    } else if (await getWindowEnabled(tab.windowId)) {
      chrome.tabs.update(tabId, { pinned: true }).catch(e => console.debug('[Always Pinned] repin failed', e));
    }
    return;
  }

  // URL変化: 新規タブから実URLに遷移したらピン留め
  if (changeInfo.url && !tab.pinned) {
    const { respectManualUnpin, manuallyUnpinned } = await getSettings();
    if (respectManualUnpin && manuallyUnpinned.includes(tabId)) return;
    if (!isNewTabUrl(changeInfo.url) && await getWindowEnabled(tab.windowId)) {
      chrome.tabs.update(tabId, { pinned: true }).catch(e => console.debug('[Always Pinned] pin on url change failed', e));
    }
  }
});

chrome.tabs.onRemoved.addListener(async tabId => {
  await removeManuallyUnpinned(tabId);
});

chrome.windows.onRemoved.addListener(async windowId => {
  await removeWindowOverride(windowId);
});

// badge: アクティブタブ / ウィンドウフォーカスの変化で実効状態を反映
chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  await updateBadgeForTab(tabId, windowId);
});

chrome.windows.onFocusChanged.addListener(async windowId => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  await refreshWindowBadge(windowId);
});

chrome.runtime.onInstalled.addListener(async () => {
  // 旧バージョンが local に残した一時キーを掃除（session へ移行済み）
  await chrome.storage.local.remove(['windowOverrides', 'manuallyUnpinned']);
  await pinAllWindows();
  await updateGlobalBadge();
  await refreshFocusedBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  // windowOverrides / manuallyUnpinned は session のため再起動で自動クリア済み（手動クリア不要）
  await pinAllWindows();
  await updateGlobalBadge();
  await refreshFocusedBadge();
});

chrome.storage.onChanged.addListener(async (changes, areaName) => {
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

updateGlobalBadge();
refreshFocusedBadge();
