param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('qiita', 'zenn', 'note', 'hatena', 'devto', 'x')]
  [string]$Platform,

  [string]$Version,
  [string]$Image1Url,
  [string]$Image2Url,
  [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root 'manifest.json'
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json

if (-not $Version) {
  $Version = "v$($manifest.version)"
}

$platformPathMap = @{
  qiita  = "docs/sns/qiita/$Version.md"
  zenn   = "docs/sns/zenn/$Version.md"
  note   = "docs/sns/note/$Version.md"
  hatena = "docs/sns/hatena/$Version.md"
  devto  = "docs/sns/devto/$Version.md"
  x      = "docs/sns/x/$Version.txt"
}

$postUrlMap = @{
  qiita  = 'https://qiita.com/drafts/new'
  zenn   = 'https://zenn.dev/'
  note   = 'https://note.com/notes/new'
  hatena = 'https://blog.hatena.ne.jp/'
  devto  = 'https://dev.to/new'
  x      = 'https://x.com/compose/post'
}

$relativeDraftPath = $platformPathMap[$Platform]
$draftPath = Join-Path $root $relativeDraftPath

if (-not (Test-Path -LiteralPath $draftPath)) {
  throw "Draft file not found: $relativeDraftPath"
}

$content = Get-Content -Raw -LiteralPath $draftPath

if ($Image1Url) {
  $content = $content.Replace('{{IMAGE_1_URL}}', $Image1Url)
}
if ($Image2Url) {
  $content = $content.Replace('{{IMAGE_2_URL}}', $Image2Url)
}

$outDir = Join-Path $root "dist/post-assist/$Platform"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$outPath = Join-Path $outDir "$Version.rendered.txt"
Set-Content -LiteralPath $outPath -Value $content -NoNewline -Encoding UTF8

Set-Clipboard -Value $content

Write-Host "Platform: $Platform"
Write-Host "Draft:    $relativeDraftPath"
Write-Host "Rendered: $outPath"
Write-Host "Copied rendered text to clipboard."

if ($content -match '\{\{IMAGE_1_URL\}\}' -or $content -match '\{\{IMAGE_2_URL\}\}') {
  Write-Warning 'Image URL placeholders remain in rendered text.'
}

if (-not $NoOpen) {
  $postUrl = $postUrlMap[$Platform]
  if ($postUrl) {
    Start-Process $postUrl | Out-Null
    Write-Host "Opened:   $postUrl"
  }
}
