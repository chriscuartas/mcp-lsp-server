# mcp-lsp Lessons

## L-001 — Windows: spawn npm global packages requires `shell: true`; Python LSP prefers `python -m`

Node.js `spawn()` on Windows cannot execute npm global packages directly — they install as `.cmd` wrappers (e.g. `typescript-language-server.cmd`) which require `cmd.exe` to execute. Without `shell: true`, spawning them produces ENOENT.

**Fix for npm packages**: set `shell: process.platform === 'win32'` in spawn options.

**Fix for Python LSP**: use `['python', '-m', 'pylsp']` instead of `['pylsp']` in the command config. `python` is always on PATH (Windows Store Python registers it); the `Scripts/` directory containing `pylsp.exe` often is not. `python -m pylsp` bypasses this gap entirely and is equally valid on Linux/Mac.

**Note**: `shell: true` with separate `args` triggers Node.js DEP0190 (security warning about arg concatenation), but is acceptable when args come from a controlled config file, not user input.

**Location**: `src/server-manager.ts` (shell flag) · `src/config.ts` (default pylsp command).

## L-002 — `initializationPromise` must be resolved in the timeout catch block

`ensureAndWait()` in `operations.ts` calls `await state.initializationPromise` before every LSP request. The promise is only resolved if the language server sends an `initialized` notification back to the client. Most servers do not — the LSP spec makes it optional. The fallback timeout in `startServer()` sets `serverState.initialized = true` but the Promise itself was never resolved, causing all subsequent LSP operations to hang indefinitely.

**Fix**: call `resolveInit()` inside the `.catch()` fallback alongside `serverState.initialized = true`.

**Location**: `src/server-manager.ts` — `startServer()` initialization race.
