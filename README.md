# Always Pinned

![Platform](https://img.shields.io/badge/platform-Chrome-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Manifest](https://img.shields.io/badge/manifest-v3-orange)

A Chrome extension that keeps all tabs pinned — automatically. New tabs are pinned on creation, manual unpins are immediately reversed, and you can toggle the behavior per window.

[日本語版 README はこちら](README.ja.md)

---

## Features

- **Force-pin all tabs** — pins every open tab at once
- **Auto-pin new tabs** — tabs are pinned as soon as they open
- **Resist manual unpin** — if you unpin a tab, it snaps back immediately
- **Per-window control** — enable or disable independently for each Chrome window
- **ON / OFF toggle** — suspend pinning any time from the popup

### How it compares

| Extension | Bulk pin | Auto-pin new | Resist unpin | Per-window | Toggle |
|---|:---:|:---:|:---:|:---:|:---:|
| **Always Pinned (this)** | ✅ | ✅ | ✅ | ✅ | ✅ |
| Pin Unpin All | ✅ | ❌ | ❌ | ❌ | ❌ |
| Tab Pinner | ✅ | ✅ (URL only) | ❌ | ❌ | ❌ |
| Always Pin | ❌ | ✅ (URL only) | ❌ | ❌ | ❌ |

---

## Installation

> Chrome Web Store listing coming soon.

### Load unpacked (developer mode)

1. Download or clone this repository
2. Open `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the repository folder
5. The 📌 icon appears in your toolbar

---

## Usage

Click the 📌 icon in the toolbar to open the popup.

| Control | Description |
|---|---|
| **This window** toggle | Enable / disable pinning for the current window only |
| **▶ Pin all in this window** | Pin all unpinned tabs in the current window immediately |
| **✕ Unpin all in this window** | Unpin all tabs in the current window |
| **Default** toggle (bottom) | Global default applied to windows with no individual setting |
| **× Reset** link | Remove the per-window override and revert to the default |

> **Note:** Per-window settings are cleared on browser restart (Chrome does not persist window IDs across sessions).

---

## Permissions

| Permission | Reason |
|---|---|
| `tabs` | Read tab state and update pinned status |
| `storage` | Persist the enabled / disabled setting |

No data leaves your browser. No external connections are made.

---

## License

MIT
