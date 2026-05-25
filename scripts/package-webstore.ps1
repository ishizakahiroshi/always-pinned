$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root 'manifest.json'
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$version = $manifest.version
$slug = 'always-pinned'

$distDir = Join-Path $root 'dist\release-assets'
$stagingDir = Join-Path $root "dist\staging\$slug"
$zipPath = Join-Path $distDir "$slug-v$version-webstore.zip"

if (Test-Path -LiteralPath $stagingDir) {
  Remove-Item -LiteralPath $stagingDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $stagingDir, $distDir | Out-Null

$files = @(
  'manifest.json',
  'background.js',
  'storage.js',
  'popup.html',
  'popup.js',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png'
)

foreach ($file in $files) {
  $source = Join-Path $root $file
  if (-not (Test-Path -LiteralPath $source)) {
    throw "Required file missing: $file"
  }

  $target = Join-Path $stagingDir $file
  $targetDir = Split-Path -Parent $target
  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
  Copy-Item -LiteralPath $source -Destination $target -Force
}

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -Path (Join-Path $stagingDir '*') -DestinationPath $zipPath -CompressionLevel Optimal

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash.ToLowerInvariant()
Write-Host "Created: $zipPath"
Write-Host "SHA256:  $hash"
