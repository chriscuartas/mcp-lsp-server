# mcp-lsp

Local MCP server that fronts real language servers (LSP) and exposes definitions, references, hover, diagnostics, and rename as tools to Claude Code.

**Stack**: TypeScript · Node.js (ESM) · `@modelcontextprotocol/sdk` (stdio) · `vscode-languageserver-protocol` · `zod`
**Working dir**: `c:/workbench/repositories/mcp-lsp`

---

## Context Files

| File | Load when |
|------|-----------|
| `.claude/lessons.md` | Debugging a recurring issue, or when adding a lesson at end-session |
| `README.md` | Setting up language servers or checking supported languages |

---

## Build and Reload

```bash
npm run build          # tsc → dist/
npm run typecheck      # tsc --noEmit — must pass before commit
npm run setup          # install/verify the backing language servers
```

`dist/` is gitignored and is what the server actually runs (`node dist/index.js`). Claude Code launches this server from `~/.claude.json` at startup — **after any `src/` change, run `npm run build` and restart Claude Code**, or the running server keeps serving the old build.

---

## Constraints

- Language servers are spawned as child processes, one adapter per language in `src/adapters/` (`intelephense`, `phpactor`, `pyright`). Python's LSP (`python-lsp-server`, see `requirements.txt`) is a separate pip install — it is not covered by `npm install`.
- On Windows, spawning npm-global language servers requires `shell: true`, and the Python server must be launched via `python -m` — see L-001. Getting this wrong makes the server start cleanly and then serve nothing.
