# setup.ps1 — Install and register mcp-lsp-server on Windows
# Run from the repo root: .\setup.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = $PSScriptRoot

Write-Host "`n=== mcp-lsp-server setup ===" -ForegroundColor Cyan

# 1. Node dependencies
Write-Host "`n[1/5] Installing Node.js dependencies..." -ForegroundColor Yellow
npm install

# 2. Build TypeScript
Write-Host "`n[2/5] Building TypeScript..." -ForegroundColor Yellow
npm run build

# 3. Global npm language servers
Write-Host "`n[3/5] Installing language servers (npm global)..." -ForegroundColor Yellow
npm install -g intelephense typescript-language-server typescript

# 4. Python LSP
Write-Host "`n[4/5] Installing Python LSP..." -ForegroundColor Yellow
pip install -r requirements.txt

# 5. Register with Claude Code
Write-Host "`n[5/5] Registering MCP server with Claude Code..." -ForegroundColor Yellow
$EntryPoint = Join-Path $RepoRoot "dist\index.js"

# Check if already registered
$existing = claude mcp get mcp-lsp 2>$null
if ($existing) {
    Write-Host "  Already registered — removing and re-adding to update path..." -ForegroundColor DarkYellow
    claude mcp remove mcp-lsp -s user 2>$null
}

claude mcp add -s user mcp-lsp node $EntryPoint
Write-Host "  Registered: node $EntryPoint" -ForegroundColor Green

Write-Host "`n=== Setup complete ===" -ForegroundColor Cyan
Write-Host "Restart Claude Code (or run /mcp to reconnect) for the server to appear.`n"
Write-Host "Optional: set INTELEPHENSE_LICENCE_KEY in your environment for full PHP support."
