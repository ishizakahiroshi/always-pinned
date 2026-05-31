$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root 'manifest.json'
$errors = [System.Collections.Generic.List[string]]::new()

function Add-ValidationError {
  param([string]$Message)
  $script:errors.Add($Message) | Out-Null
}

function Test-RequiredFile {
  param([string]$RelativePath)

  $path = Join-Path $root $RelativePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    Add-ValidationError "Missing required file: $RelativePath"
  }
}

function Get-PngDimension {
  param(
    [byte[]]$Bytes,
    [int]$Offset
  )

  return (($Bytes[$Offset] -shl 24) -bor
    ($Bytes[$Offset + 1] -shl 16) -bor
    ($Bytes[$Offset + 2] -shl 8) -bor
    $Bytes[$Offset + 3])
}

function Test-PngIcon {
  param(
    [string]$RelativePath,
    [int]$ExpectedSize
  )

  $path = Join-Path $root $RelativePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    Add-ValidationError "Missing icon: $RelativePath"
    return
  }

  $bytes = [System.IO.File]::ReadAllBytes($path)
  $signature = [byte[]](0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
  if ($bytes.Length -lt 24) {
    Add-ValidationError "Icon is too small to be a valid PNG: $RelativePath"
    return
  }

  for ($i = 0; $i -lt $signature.Length; $i++) {
    if ($bytes[$i] -ne $signature[$i]) {
      Add-ValidationError "Icon is not a PNG file: $RelativePath"
      return
    }
  }

  $width = Get-PngDimension -Bytes $bytes -Offset 16
  $height = Get-PngDimension -Bytes $bytes -Offset 20
  if ($width -ne $ExpectedSize -or $height -ne $ExpectedSize) {
    Add-ValidationError "Icon has unexpected dimensions: $RelativePath ($width x $height, expected $ExpectedSize x $ExpectedSize)"
  }
}

function Test-JavaScriptSyntax {
  param([string[]]$RelativePaths)

  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    Write-Warning 'Node.js was not found; skipping JavaScript syntax checks.'
    return
  }

  foreach ($relativePath in $RelativePaths) {
    $path = Join-Path $root $relativePath
    $output = & $node.Source --check $path 2>&1
    if ($LASTEXITCODE -ne 0) {
      Add-ValidationError "JavaScript syntax check failed for $relativePath`n$output"
    }
  }
}

function Test-PowerShellSyntax {
  param([string[]]$RelativePaths)

  foreach ($relativePath in $RelativePaths) {
    $path = Join-Path $root $relativePath
    $tokens = $null
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$parseErrors) | Out-Null
    foreach ($parseError in $parseErrors) {
      Add-ValidationError "PowerShell syntax check failed for $relativePath`: $($parseError.Message)"
    }
  }
}

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw 'manifest.json is missing.'
}

try {
  $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
} catch {
  throw "manifest.json is not valid JSON: $($_.Exception.Message)"
}

if ($manifest.manifest_version -ne 3) {
  Add-ValidationError 'manifest_version must be 3.'
}
if (-not $manifest.name) {
  Add-ValidationError 'manifest.name is required.'
}
if ($manifest.version -notmatch '^\d+\.\d+\.\d+$') {
  Add-ValidationError "manifest.version must use x.y.z format: $($manifest.version)"
}
if ($manifest.background.type -ne 'module') {
  Add-ValidationError 'background.type must be module.'
}
if (-not $manifest.background.service_worker) {
  Add-ValidationError 'background.service_worker is required.'
}
if (-not $manifest.action.default_popup) {
  Add-ValidationError 'action.default_popup is required.'
}

$permissions = @($manifest.permissions)
foreach ($permission in @('tabs', 'storage')) {
  if ($permissions -notcontains $permission) {
    Add-ValidationError "Missing manifest permission: $permission"
  }
}
if ($manifest.host_permissions) {
  Add-ValidationError 'host_permissions should stay empty for this extension.'
}

$requiredFiles = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
@(
  'manifest.json',
  'background.js',
  'storage.js',
  'popup.html',
  'popup.js',
  'README.md',
  'README.ja.md',
  'LICENSE',
  'CHANGELOG.md',
  'scripts/package-webstore.ps1',
  'scripts/post-assist.ps1',
  'scripts/validate-extension.ps1'
) | ForEach-Object { $requiredFiles.Add($_) | Out-Null }
$requiredFiles.Add([string]$manifest.background.service_worker) | Out-Null
$requiredFiles.Add([string]$manifest.action.default_popup) | Out-Null

$iconEntries = @{}
foreach ($property in $manifest.icons.PSObject.Properties) {
  $iconEntries[$property.Name] = [string]$property.Value
}
foreach ($property in $manifest.action.default_icon.PSObject.Properties) {
  $iconEntries[$property.Name] = [string]$property.Value
}
foreach ($iconPath in $iconEntries.Values) {
  $requiredFiles.Add($iconPath) | Out-Null
}
foreach ($file in $requiredFiles) {
  Test-RequiredFile $file
}

foreach ($entry in $iconEntries.GetEnumerator()) {
  $size = 0
  if ([int]::TryParse($entry.Key, [ref]$size)) {
    Test-PngIcon -RelativePath $entry.Value -ExpectedSize $size
  }
}

$moduleImportPattern = "(?m)^\s*import\s+(?:[\s\S]*?\s+from\s+)?['""](?<path>\./[^'""]+)['""]"
foreach ($relativePath in @('background.js', 'popup.js')) {
  $source = Get-Content -Raw -LiteralPath (Join-Path $root $relativePath)
  foreach ($match in [regex]::Matches($source, $moduleImportPattern)) {
    $importPath = $match.Groups['path'].Value.TrimStart('./')
    Test-RequiredFile $importPath
  }
}

$popupHtml = Get-Content -Raw -LiteralPath (Join-Path $root 'popup.html')
if ($popupHtml -match '(?is)<script(?![^>]*\bsrc=)[^>]*>') {
  Add-ValidationError 'popup.html must not contain inline scripts.'
}
if ($popupHtml -notmatch '<script[^>]+type="module"[^>]+src="popup\.js"') {
  Add-ValidationError 'popup.html must load popup.js as a module script.'
}

$changelog = Get-Content -Raw -LiteralPath (Join-Path $root 'CHANGELOG.md')
$versionHeading = "## [$($manifest.version)]"
if (-not $changelog.Contains($versionHeading) -and $changelog -notmatch '(?m)^## \[Unreleased\]') {
  Add-ValidationError "CHANGELOG.md must contain $versionHeading or an Unreleased section."
}

Test-JavaScriptSyntax @('background.js', 'popup.js', 'storage.js')
Test-PowerShellSyntax @('scripts/package-webstore.ps1', 'scripts/post-assist.ps1', 'scripts/validate-extension.ps1')

if ($errors.Count -gt 0) {
  $errors | ForEach-Object { Write-Host "ERROR: $_" -ForegroundColor Red }
  exit 1
}

Write-Host 'Extension validation passed.'
