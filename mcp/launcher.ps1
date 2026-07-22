param(
  [Parameter(Mandatory = $true)]
  [string]$State
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

try {
  $bridgeState = Get-Content -Raw -Encoding UTF8 -LiteralPath $State | ConvertFrom-Json
  $runtimeExecutable = [string]$bridgeState.runtimeExecutable
  if (-not $runtimeExecutable -or -not (Test-Path -LiteralPath $runtimeExecutable -PathType Leaf)) {
    throw "Terminal Matrix is not running or its MCP runtime is unavailable."
  }

  $serverScript = Join-Path $PSScriptRoot "terminal-matrix-remote.js"
  if (-not (Test-Path -LiteralPath $serverScript -PathType Leaf)) {
    $serverScript = Join-Path $PSScriptRoot "remote-server.js"
  }
  if (-not (Test-Path -LiteralPath $serverScript -PathType Leaf)) {
    throw "The Terminal Matrix MCP server script is missing."
  }

  $env:ELECTRON_RUN_AS_NODE = "1"
  & $runtimeExecutable $serverScript --state $State
  exit $LASTEXITCODE
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
