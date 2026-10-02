# Privacy Policy

Last updated: 2026-07-10

Always Pinned does not collect, store, sell, or share personal information.

## Information Collection

This extension does not collect personal information, browsing history, page content, form input, cookies, or credentials.

## External Communication

The extension itself does not make external network requests. One exception applies: while the popup is open, Chrome loads the favicon images shown in the tab list directly from each website (standard browser image requests, with the referrer not sent). No other external communication occurs, and no data is transmitted by the extension.

## Locally Stored Data

The extension stores settings in Chrome storage on the user's device. Persistent settings (enabled/disabled, new-tab exclusion, respect-manual-unpin) are kept in `chrome.storage.local`. Temporary per-window settings and tab IDs used to respect manual unpin actions are kept in `chrome.storage.session`, which is held in memory and cleared when the browser restarts.

This data stays inside the user's browser and is not transmitted externally by the extension.

## Permissions

- tabs: Used to read tab pinned status and update tab pinned status when needed.
- storage: Used to save extension settings.
- contextMenus: Used to offer “keep unpinned” / “allow re-pin” actions on tab right-click menus.

## Changes

If this policy changes, updates will be reflected in this document.
