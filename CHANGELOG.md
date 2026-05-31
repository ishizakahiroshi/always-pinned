# Changelog

All notable changes to this project will be documented in this file.

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

- Added promo video at `docs/always-pinned.mp4`.
- Added English/Japanese UI localization in the popup based on browser language.
- Added `docs/release-notes-v0.1.1.md`.

### Changed

- Updated `README.md` with a `Promo Video` section linking to the video.
- Changed badge behavior: no `ON` text when enabled, `OFF` text when disabled.
- Updated popup labels and status text presentation for localized wording.
