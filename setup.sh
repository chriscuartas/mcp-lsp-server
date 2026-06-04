#!/usr/bin/env bash
# setup.sh — Install and register mcp-lsp-server on macOS / Linux
# Run from the repo root: bash setup.sh

set -e
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "=== mcp-lsp-server setup ==="

# 1. Node dependencies
echo ""
echo "[1/5] Installing Node.js dependencies..."
npm install

# 2. Build TypeScript
echo ""
echo "[2/5] Building TypeScript..."
npm run build

# 3. Global npm language servers
echo ""
echo "[3/5] Installing language servers (npm global)..."
npm install -g intelephense typescript-language-server typescript

# 4. Python LSP
echo ""
echo "[4/5] Installing Python LSP..."
pip install -r requirements.txt

# 5. Register with Claude Code
echo ""
echo "[5/5] Registering MCP server with Claude Code..."
ENTRY_POINT="$REPO_ROOT/dist/index.js"

# Remove existing registration if present
if claude mcp get mcp-lsp &>/dev/null; then
    echo "  Already registered — removing and re-adding to update path..."
    claude mcp remove mcp-lsp -s user &>/dev/null || true
fi

claude mcp add -s user mcp-lsp node "$ENTRY_POINT"
echo "  Registered: node $ENTRY_POINT"

echo ""
echo "=== Setup complete ==="
echo "Restart Claude Code (or run /mcp to reconnect) for the server to appear."
echo ""
echo "Optional: export INTELEPHENSE_LICENCE_KEY=<key> for full PHP support."
