param(
  [Parameter(Mandatory=$true)][string]$SourceArchive,
  [Parameter(Mandatory=$true)][string]$OutputArchive
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$project = Split-Path $PSScriptRoot -Parent
$prefix = 'remix-of-pixel-perfect-feature-daily-progress-rings/'
if (Test-Path -LiteralPath $OutputArchive) { throw 'Output exists; preserving it.' }
$names = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
$original = [System.IO.Compression.ZipFile]::OpenRead($SourceArchive)
try {
  foreach ($entry in $original.Entries) {
    if ($entry.FullName.StartsWith($prefix) -and !$entry.FullName.EndsWith('/')) {
      $null = $names.Add($entry.FullName.Substring($prefix.Length))
    }
  }
} finally { $original.Dispose() }
foreach ($directory in @('src','public','supabase','android/app/src','ios','scripts')) {
  $path = Join-Path $project $directory
  if (!(Test-Path -LiteralPath $path)) { continue }
  foreach ($file in Get-ChildItem -LiteralPath $path -File -Recurse) {
    $relative = [System.IO.Path]::GetRelativePath($project,$file.FullName).Replace('\','/')
    $null = $names.Add($relative)
  }
}
foreach ($file in Get-ChildItem -LiteralPath $project -File) {
  if ($file.Extension -eq '.md' -or $file.Name -eq '.env.handoff.example') { $null=$names.Add($file.Name) }
}
$exclude = '(^|/)(node_modules|build|dist|\.gradle|\.vercel|Pods|DerivedData|\.git|\.ui-preview-cache)(/|$)|(^|/)(local\.properties|\.env\.local|\.env\.production|\.handoff-preview.*|\.ui-preview.*|\.weekly-preview.*|handoff-preview\.html|ui-preview\.html|weekly-ui-preview\.html)$'
$archive = [System.IO.Compression.ZipFile]::Open($OutputArchive,[System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($relative in ($names | Sort-Object)) {
    if ($relative -match $exclude) { continue }
    if ($relative -match '(^|/)\.env' -and $relative -notmatch '\.example$') { continue }
    $path=Join-Path $project $relative
    if (!(Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing source file: $relative" }
    $null=[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$path,($prefix+$relative),[System.IO.Compression.CompressionLevel]::Optimal)
  }
} finally { $archive.Dispose() }
$check=[System.IO.Compression.ZipFile]::OpenRead($OutputArchive)
try {
  $seen=[System.Collections.Generic.HashSet[string]]::new()
  foreach ($entry in $check.Entries) {
    $relative=$entry.FullName.Substring($prefix.Length)
    if ($relative -match $exclude) { throw "Excluded file packaged: $relative" }
    if (!$seen.Add($entry.FullName)) { throw "Duplicate entry: $relative" }
  }
  foreach ($required in @('src/lib/task-completion.server.ts','supabase/migrations/20261023000500_confirmed_task_schedule.sql','HANDOFF_TEST_RESULTS.md','scripts/test-handoff-db.mjs','.env.handoff.example')) {
    if (!$seen.Contains($prefix+$required)) { throw "Missing required file: $required" }
  }
  Write-Output "Verified $($check.Entries.Count) unique source files; local builds, dependencies and preview fixtures excluded."
} finally { $check.Dispose() }
Get-FileHash -LiteralPath $OutputArchive -Algorithm SHA256
