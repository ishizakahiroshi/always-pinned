# Always Pinned v0.1.2

Reliability and consistency update.

## Added

- Local extension validation script: `scripts/validate-extension.ps1`
- Package script validation before Web Store zip creation

## Changed

- New installs now re-pin manually unpinned tabs by default, matching the extension description
- Popup actions now report failures instead of leaving rejected Chrome API calls unhandled
- Extension icons regenerated from the checked-in icon generator
- Helper scripts now resolve repository paths more consistently

## Fixed

- "Unpin All" now disables pinning for the current window before unpinning tabs
- Tabs removed from the manual-unpin list when the user pins them again
- Background event handlers now guard transient Chrome API failures

## Package

- Chrome Web Store package: `always-pinned-v0.1.2-webstore.zip`
- SHA256: `e4ac46fb9d82ffde7bddde52eec0a21efd9c09456e274ac812602946440915c6`

## Integrity check

```powershell
Get-FileHash .\always-pinned-v0.1.2-webstore.zip -Algorithm SHA256
```
