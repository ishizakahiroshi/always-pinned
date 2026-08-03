// utils.js — Always Pinned の共有純粋ヘルパ（ストレージや chrome 副作用なし）

const NEW_TAB_HOSTS = new Set([
  'newtab',
  'new-tab-page',
  'new-tab-page-third-party'
]);

/**
 * 新規タブ（まだ実サイトへ遷移していないページ）かどうか。
 * Chrome は chrome://newtab/ から chrome://new-tab-page/ へ遷移するため、
 * ホスト名ベースで判定する（クエリ・ハッシュ付きも吸収）。
 */
export function isNewTabUrl(url) {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'about:') {
      const page = parsed.pathname || '';
      return page === 'blank' || page === 'newtab';
    }
    if (parsed.protocol === 'chrome:' || parsed.protocol === 'edge:') {
      return NEW_TAB_HOSTS.has(parsed.hostname);
    }
  } catch {
    // 不正 URL は新規タブ扱いにしない
  }
  return false;
}

/**
 * 設定に照らし、未ピンのタブをピン留めすべきか。
 * background の pinTabsInWindow / popup のトグル ON・リセットで共通利用。
 *
 * manuallyUnpinned に入っているタブは、respectManualUnpin の値に関わらず除外する。
 * （popup 行操作・コンテキストメニューで明示した例外を、強制再ピン設定でも守るため）
 * 通常の Chrome UI 手動解除は respect ON のときだけリストへ入り、OFF のときはリストに載らない。
 */
export function shouldAutoPinTab(tab, { skipNewTab, manuallyUnpinned }) {
  if (tab == null || tab.id == null) return false;
  if (Array.isArray(manuallyUnpinned) && manuallyUnpinned.includes(tab.id)) {
    return false;
  }
  if (skipNewTab && isNewTabUrl(tab.url || tab.pendingUrl)) {
    return false;
  }
  return true;
}
