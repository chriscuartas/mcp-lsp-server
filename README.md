# mcp-lsp-server

MCP server that bridges Claude Code to language servers (LSP). Gives Claude real symbol intelligence — go-to-definition, find references, diagnostics, rename — for PHP, TypeScript, and Python, instead of grep+read chains.

---

## Tools

**Tier 1 — Navigation**
| Tool | Description |
|------|-------------|
| `find_definition` | Jump to where a symbol is defined |
| `find_references` | All usages of a symbol across the workspace |
| `find_implementations` | Implementations of an interface or abstract method |
| `get_hover` | Type info and docs at a position |

**Tier 1 — Diagnostics & Symbols**
| Tool | Description |
|------|-------------|
| `get_diagnostics` | Errors and warnings for a file |
| `find_workspace_symbols` | Search for symbols by name across the project |
| `find_document_symbols` | Outline tree for a single file |

**Tier 1 — Refactoring**
| Tool | Description |
|------|-------------|
| `rename_symbol` | Rename everywhere; use `dry_run: true` first |
| `get_code_actions` | Quick fixes and refactor suggestions for a range |

**Tier 2 — Hierarchy**
| Tool | Description |
|------|-------------|
| `get_call_hierarchy_incoming` | Who calls this function |
| `get_call_hierarchy_outgoing` | What this function calls |
| `get_type_hierarchy_subtypes` | Subclasses / implementors |
| `get_type_hierarchy_supertypes` | Parent classes / interfaces |

**Tier 2 — Intelligence**
| Tool | Description |
|------|-------------|
| `get_signature_help` | Parameter hints at a call site |
| `get_inlay_hints` | Inline type annotations for a range |
| `get_completions` | Completion candidates at a position |

**Tier 3 — Meta**
| Tool | Description |
|------|-------------|
| `start_lsp` | Start the server for a file (also used to warm up) |
| `restart_lsp` | Restart one or all language servers |
| `get_server_capabilities` | Show what the server supports |
| `list_active_sessions` | Show running language server sessions |

**Prompts**
| Prompt | Description |
|--------|-------------|
| `resolve-facade` | PHP — resolve a Laravel facade to its concrete class |
| `find-model-callers` | PHP — find all callers of an Eloquent model method |
| `analyze-hooks-deps` | TypeScript — audit React hook dependency arrays |

---

## Requirements

**Node.js** ≥ 18 (ESM support required)

**Language servers** (install globally via npm):
```
npm install -g intelephense typescript-language-server typescript
```

**Python LSP** (install via pip):
```
pip install python-lsp-server
```

> **Windows note**: npm global packages install as `.cmd` wrappers. The server handles this automatically via `shell: true` on Windows — no PATH changes needed. Python's `pylsp` is invoked as `python -m pylsp` so the Python Scripts directory does not need to be on PATH.

---

## Installation

Run the setup script from the repo root. It installs dependencies, builds, and registers the MCP server with Claude Code.

**Windows (PowerShell):**
```powershell
.\setup.ps1
```

**macOS / Linux:**
```bash
bash setup.sh
```

After setup, restart Claude Code (or run `/mcp` to reconnect) for the server to appear.

---

## Configuration

The server auto-discovers config by looking for `.claude/mcp-lsp.json` in the current working directory when Claude Code starts it. If no config is found, it falls back to built-in defaults (intelephense + typescript-language-server + pylsp, no rootDir).

**Config format:**
```json
{
  "servers": [
    {
      "extensions": ["php"],
      "command": ["intelephense", "--stdio"],
      "rootDir": "/absolute/path/to/project"
    },
    {
      "extensions": ["ts", "tsx", "js", "jsx"],
      "command": ["typescript-language-server", "--stdio"],
      "rootDir": "/absolute/path/to/project"
    }
  ]
}
```

Place this file at `<your-project>/.claude/mcp-lsp.json`. The `rootDir` tells the language server where the workspace root is (used for project-wide indexing).

**Config discovery order:**
1. `MCP_LSP_CONFIG` environment variable (absolute path)
2. `<cwd>/.claude/mcp-lsp.json`
3. Built-in defaults

---

## CLAUDE.md Integration

After installing, add the following section to your workbench `CLAUDE.md` (the one spanning all projects) so Claude knows to use these tools instead of grep+read chains:

```markdown
### mcp-lsp Code Navigation

For PHP, TypeScript, and Python files, prefer mcp-lsp tools over grep+read chains for symbol work. Tools are deferred — load via ToolSearch before calling.

| Task | Tool |
|---|---|
| Go to definition | `mcp__mcp-lsp__find_definition` |
| All references | `mcp__mcp-lsp__find_references` |
| Type info / docs | `mcp__mcp-lsp__get_hover` |
| Errors in a file | `mcp__mcp-lsp__get_diagnostics` |
| Rename everywhere | `mcp__mcp-lsp__rename_symbol` (`dry_run: true` first) |
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MCP_LSP_CONFIG` | Absolute path to a `mcp-lsp.json` config file — overrides auto-discovery |
| `MCP_LSP_DEBUG` | Set to `1` to enable verbose debug logging to stderr |
| `INTELEPHENSE_LICENCE_KEY` | Optional intelephense licence key — unlocks go-to-definition for PHP built-ins |

---

## Architecture

```
src/
  index.ts                  MCP server bootstrap — tool/prompt/resource registration
  config.ts                 Config loader: env var → file → defaults (Zod schema)
  types.ts                  Shared types: ServerState, adapters, LSP primitives
  logger.ts                 Stderr logger; enable debug with MCP_LSP_DEBUG=1
  utils.ts                  pathToUri / uriToPath (Windows file:///c:/ format)
  json-rpc.ts               JSON-RPC transport with Content-Length framing
  server-manager.ts         Session lifecycle, concurrency-safe spawn, preload
  document-manager.ts       didOpen/didChange/didClose with versioning
  diagnostics-cache.ts      publishDiagnostics cache with idle-wait
  operations.ts             All LSP calls (definition, refs, rename, diagnostics…)
  multi-position.ts         ±1 offset retry for LLM off-by-one position errors
  server-resolver.ts        Match file extension → ServerConfig → ServerState
  adapters/
    registry.ts             Auto-detect adapter from command name
    intelephense.ts         Licence key injection, storagePath
    phpactor.ts             phpactor init
    pyright.ts              Extended timeouts (first-run analysis is slow)
  tools/
    navigation.ts           find_definition, find_references, find_implementations, get_hover
    diagnostics.ts          get_diagnostics
    symbols.ts              find_workspace_symbols, find_document_symbols
    refactoring.ts          rename_symbol, get_code_actions
    hierarchy.ts            call hierarchy, type hierarchy
    intelligence.ts         get_signature_help, get_inlay_hints, get_completions
    meta.ts                 start_lsp, restart_lsp, get_server_capabilities, list_active_sessions
    raw.ts                  lsp_raw_request (requires enableRawMode: true in config)
  extensions/
    base.ts                 Extension/McpTool/McpPrompt interfaces
    php/index.ts            resolve-facade, find-model-callers prompts
    typescript/index.ts     analyze-hooks-deps prompt
  resources/
    diagnostics.ts          lsp-diagnostics:// subscription resource
  setup/
    index.ts                Interactive setup wizard (npm run setup)
```

---

## Debugging

Enable verbose output:
```
MCP_LSP_DEBUG=1 node dist/index.js
```

Language server stderr is forwarded to Claude Code's stderr automatically.
