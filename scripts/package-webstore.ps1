$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root 'manifest.json'
$validateScript = Join-Path $PSScriptRoot 'validate-extension.ps1'

if (Test-Path -LiteralPath $validateScript -PathType Leaf) {
  & $validateScript
}

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
  'utils.js',
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

# Layer 4 gate: scan exactly what ships in the zip (the staging copies) before
# archiving. Fail closed when Node.js is unavailable.
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw 'Node.js was not found; refusing to package without the secrets-scan gate.'
}
$listPath = Join-Path ([System.IO.Path]::GetTempPath()) "always-pinned-package-$PID.list"
$files | ForEach-Object { Join-Path $root $_ } | Set-Content -LiteralPath $listPath -Encoding UTF8
try {
  & $node.Source (Join-Path $PSScriptRoot 'secrets-scan.mjs') '--files-from-list' $listPath '--block'
  if ($LASTEXITCODE -ne 0) {
    throw "secrets-scan blocked packaging (exit code $LASTEXITCODE)"
  }
} finally {
  Remove-Item -LiteralPath $listPath -Force -ErrorAction SilentlyContinue
}

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -Path (Join-Path $stagingDir '*') -DestinationPath $zipPath -CompressionLevel Optimal

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash.ToLowerInvariant()
$sumsPath = Join-Path $distDir "SHA256SUMS-v$version.txt"
Set-Content -LiteralPath $sumsPath -Value "$hash  $(Split-Path -Leaf $zipPath)" -Encoding ASCII
Write-Host "Created: $zipPath"
Write-Host "SHA256:  $hash"
Write-Host "Sums:    $sumsPath"
