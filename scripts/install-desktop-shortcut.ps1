param(
  [string]$ShortcutName = ""
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$electronExe = Join-Path $projectRoot "node_modules\electron\dist\electron.exe"

if (-not $ShortcutName) {
  $ShortcutName = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("57uI56uv55+p6Zi1"))
}

if (-not (Test-Path -LiteralPath $electronExe)) {
  $installer = Join-Path $projectRoot "node_modules\electron\install.js"
  if (-not (Test-Path -LiteralPath $installer)) {
    throw "Electron is not installed. Run npm install first."
  }
  $previousSkip = $env:ELECTRON_SKIP_BINARY_DOWNLOAD
  Remove-Item Env:ELECTRON_SKIP_BINARY_DOWNLOAD -ErrorAction SilentlyContinue
  & node $installer
  if ($null -ne $previousSkip) {
    $env:ELECTRON_SKIP_BINARY_DOWNLOAD = $previousSkip
  }
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $electronExe)) {
    throw "Electron runtime installation failed."
  }
}

$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop ($ShortcutName + ".lnk")
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $electronExe
$shortcut.Arguments = '"' + $projectRoot + '"'
$shortcut.WorkingDirectory = $projectRoot
$shortcut.Description = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("5Zyo5LiA5Liq56qX5Y+j5Lit6L+Q6KGM5aSa5Liq5Lqk5LqS5byP57uI56uv"))
$shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,41"
$shortcut.Save()

Write-Output $shortcutPath
