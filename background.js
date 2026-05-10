async function getSettings() {
  return chrome.storage.local.get({
    enabled: true,
    windowOverrides: {},
    skipNewTab: true,
    respectManualUnpin: true,
    manuallyUnpinned: []
  });
}

async function getWindowEnabled(windowId) {
  const { enabled, windowOverrides } = await getSettings();
  return windowId in windowOverrides ? windowOverrides[windowId] : enabled;
}

function isNewTabUrl(url) {
  return !url || url === 'chrome://newtab/' || url === 'about:blank';
}

async function pinTabsInWindow(windowId) {
  const { skipNewTab, respectManualUnpin, manuallyUnpinned, enabled, windowOverrides } = await getSettings();
  const isEnabled = windowId in windowOverrides ? windowOverrides[windowId] : enabled;
  if (!isEnabled) return;

  const tabs = await chrome.tabs.query({ pinned: false, windowId });
  await Promise.all(tabs.map(tab => {
    if (respectManualUnpin && manuallyUnpinned.includes(tab.id)) return;
    if (skipNewTab && isNewTabUrl(tab.url || tab.pendingUrl)) return;
    return chrome.tabs.update(tab.id, { pinned: true }).catch(() => {});
  }));
}

async function pinAllWindows() {
  const windows = await chrome.windows.getAll();
  await Promise.all(windows.map(win => pinTabsInWindow(win.id)));
}

async function updateBadge() {
  const { enabled } = await getSettings();
  chrome.action.setBadgeText({ text: enabled ? '' : 'OFF' });
  chrome.action.setBadgeBackgroundColor({ color: enabled ? '#1a73e8' : '#888888' });
}

chrome.tabs.onCreated.addListener(async tab => {
  const { skipNewTab, respectManualUnpin, manuallyUnpinned } = await getSettings();
  if (!await getWindowEnabled(tab.windowId)) return;
  if (respectManualUnpin && manuallyUnpinned.includes(tab.id)) return;
  if (skipNewTab && isNewTabUrl(tab.url || tab.pendingUrl)) return;
  chrome.tabs.update(tab.id, { pinned: true }).catch(() => {});
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // ユーザーが手動でピン解除した
  if (changeInfo.pinned === false) {
    const { respectManualUnpin, manuallyUnpinned } = await getSettings();
    if (respectManualUnpin) {
      if (!manuallyUnpinned.includes(tabId)) {
        await chrome.storage.local.set({ manuallyUnpinned: [...manuallyUnpinned, tabId] });
      }
    } else if (await getWindowEnabled(tab.windowId)) {
      chrome.tabs.update(tabId, { pinned: true }).catch(() => {});
    }
    return;
  }

  // URL変化: 新規タブから実URLに遷移したらピン留め
  if (changeInfo.url && !tab.pinned) {
    const { respectManualUnpin, manuallyUnpinned } = await getSettings();
    if (respectManualUnpin && manuallyUnpinned.includes(tabId)) return;
    if (!isNewTabUrl(changeInfo.url) && await getWindowEnabled(tab.windowId)) {
      chrome.tabs.update(tabId, { pinned: true }).catch(() => {});
    }
  }
});

chrome.tabs.onRemoved.addListener(async tabId => {
  const { manuallyUnpinned } = await getSettings();
  const updated = manuallyUnpinned.filter(id => id !== tabId);
  if (updated.length !== manuallyUnpinned.length) {
    await chrome.storage.local.set({ manuallyUnpinned: updated });
  }
});

chrome.windows.onRemoved.addListener(async windowId => {
  const { windowOverrides } = await getSettings();
  if (windowId in windowOverrides) {
    delete windowOverrides[windowId];
    await chrome.storage.local.set({ windowOverrides });
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  await pinAllWindows();
  updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await chrome.storage.local.set({ windowOverrides: {}, manuallyUnpinned: [] });
  await pinAllWindows();
  updateBadge();
});

chrome.storage.onChanged.addListener(async changes => {
  if ('enabled' in changes) {
    if (changes.enabled.newValue) {
      await chrome.storage.local.set({ manuallyUnpinned: [] });
      await pinAllWindows();
    }
    updateBadge();
    return;
  }
  if ('respectManualUnpin' in changes && !changes.respectManualUnpin.newValue) {
    await chrome.storage.local.set({ manuallyUnpinned: [] });
    await pinAllWindows();
    return;
  }
  if ('skipNewTab' in changes && !changes.skipNewTab.newValue) {
    await pinAllWindows();
  }
});

updateBadge();
