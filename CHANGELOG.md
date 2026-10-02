# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Popup status hero (window ON/OFF and pin counts at a glance).
- One-line help under Exclude New Tabs and Respect Manual Unpin.
- Success feedback after Pin All / Unpin All / window toggle / presets.
- Per-tab row actions: unpin-and-keep-free, restore re-pin target, pin.
- Tab list filter by title or URL.
- Lock tight / Soft pin presets for common setting combos.
- Keyboard command `toggle-window-pin` (suggested Ctrl+Shift+Y / Cmd+Shift+Y).
- Tab context menu: keep unpinned / allow re-pin again (`contextMenus` permission).

### Changed

- Explicit exception list entries are honored even when Respect Manual Unpin is off (so row/menu actions stay reliable).
- Popup width 280px for the denser controls layout.
- `package-webstore.ps1` now writes `SHA256SUMS-v<version>.txt` next to the zip and runs the secrets-scan gate on the exact staging files before archiving (fail closed without Node.js).

### Fixed

- Corrected privacy wording across README / store listing / privacy policy: the extension sends no data itself, but Chrome loads tab favicon images while the popup is open. Also clarified `chrome.storage.local` vs `session` usage.
- Added `minimum_chrome_version: 102` (required by `chrome.storage.session`).
- Pinned CI actions by SHA, added least-privilege `permissions: contents: read`, widened push scan coverage to all branches, dropped unneeded full fetch.
- Hardened secrets-scan: staged mode now scans index content (`git show :path`) instead of the working tree, exempt paths match on path boundaries instead of substrings, and a new `--files-from-list` mode supports packaging gates.
- Tightened `validate-extension.ps1`: fails closed when Node.js is missing (opt-out via `-SkipNodeCheck`), and structurally requires `favIconUrl` to be used only through `getSafeFaviconUrl()`.
- Clarified in `storage.js` that the RMW lock serializes per context only.
- Added project `CLAUDE.md`; replaced "coming soon" store note with the live link; fixed stale promo-video path in this changelog; resolved `docs/store/` ignore-vs-tracked contradiction.

## [0.1.2] - 2026-05-31

### Added

- Added `scripts/validate-extension.ps1` for local manifest, asset, and syntax validation.

### Changed

- Changed the default manual-unpin behavior to re-pin tabs unless the user enables respect mode.
- Made popup batch actions and background event handlers more resilient to transient Chrome API failures.
- Regenerated extension icons from the checked-in icon generator.
- Made helper scripts work from the repository root more consistently.

### Fixed

- Fixed the popup "Unpin All" action so forced pinning does not immediately reverse it.
- Fixed manually unpinned tabs staying exempt after the user pins them again.

## [0.1.1] - 2026-05-10

### Added

- Added promo video (hosted on GitHub user attachments: https://github.com/user-attachments/assets/b6619107-b977-49e8-82bd-612b725b2118).
- Added English/Japanese UI localization in the popup based on browser language.
- Added `docs/release-notes-v0.1.1.md`.

### Changed

- Updated `README.md` with a `Promo Video` section linking to the video.
- Changed badge behavior: no `ON` text when enabled, `OFF` text when disabled.
- Updated popup labels and status text presentation for localized wording.
