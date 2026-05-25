// storage.js — Always Pinned のストレージ集約ヘルパ
//
// 永続設定 (enabled / skipNewTab / respectManualUnpin) は chrome.storage.local。
// 一時状態 (windowOverrides / manuallyUnpinned) は chrome.storage.session に置き、
// ブラウザ再起動で自動的にリセットされるようにする（onStartup の手動クリア不要）。
//
// windowOverrides / manuallyUnpinned の Read-Modify-Write は
// モジュールスコープの Promise チェーン (withSessionLock) で直列化し、
// 並行更新による lost update を防ぐ。

const PERSISTENT_DEFAULTS = {
  enabled: true,
  skipNewTab: true,
  respectManualUnpin: true
};

const SESSION_DEFAULTS = {
  windowOverrides: {},
  manuallyUnpinned: []
};

// session 領域への RMW を直列化するためのロック（モジュールスコープの Promise チェーン）
let sessionTail = Promise.resolve();
function withSessionLock(task) {
  const result = sessionTail.then(task, task);
  // 1 タスクが失敗してもチェーンを途切れさせない
  sessionTail = result.catch(() => {});
  return result;
}

// 永続設定 + 一時状態をマージして返す（呼び出し側は従来どおり 5 キーを受け取れる）
export async function getSettings() {
  const local = await chrome.storage.local.get(PERSISTENT_DEFAULTS);
  let session = { ...SESSION_DEFAULTS };
  try {
    session = await chrome.storage.session.get(SESSION_DEFAULTS);
  } catch {
    // popup 起動直後など access level 設定前は session へアクセスできない場合がある。既定値で代替する。
  }
  return { ...local, ...session };
}

// --- windowOverrides（最小差分・直列化） ---

export function setWindowOverride(windowId, value) {
  const key = String(windowId);
  return withSessionLock(async () => {
    const { windowOverrides } = await chrome.storage.session.get({ windowOverrides: {} });
    windowOverrides[key] = value;
    await chrome.storage.session.set({ windowOverrides });
  });
}

export function removeWindowOverride(windowId) {
  const key = String(windowId);
  return withSessionLock(async () => {
    const { windowOverrides } = await chrome.storage.session.get({ windowOverrides: {} });
    if (key in windowOverrides) {
      delete windowOverrides[key];
      await chrome.storage.session.set({ windowOverrides });
    }
  });
}

// --- manuallyUnpinned（最小差分・直列化） ---

export function addManuallyUnpinned(tabId) {
  return withSessionLock(async () => {
    const { manuallyUnpinned } = await chrome.storage.session.get({ manuallyUnpinned: [] });
    if (!manuallyUnpinned.includes(tabId)) {
      await chrome.storage.session.set({ manuallyUnpinned: [...manuallyUnpinned, tabId] });
    }
  });
}

export function removeManuallyUnpinned(tabIdOrIds) {
  const ids = new Set(Array.isArray(tabIdOrIds) ? tabIdOrIds : [tabIdOrIds]);
  return withSessionLock(async () => {
    const { manuallyUnpinned } = await chrome.storage.session.get({ manuallyUnpinned: [] });
    const updated = manuallyUnpinned.filter(id => !ids.has(id));
    if (updated.length !== manuallyUnpinned.length) {
      await chrome.storage.session.set({ manuallyUnpinned: updated });
    }
  });
}

export function clearManuallyUnpinned() {
  return withSessionLock(() => chrome.storage.session.set({ manuallyUnpinned: [] }));
}
