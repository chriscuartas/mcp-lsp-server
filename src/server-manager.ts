import { spawn } from 'node:child_process';
import { logger } from './logger.js';
import { pathToUri } from './utils.js';
import { JsonRpcTransport } from './json-rpc.js';
import { DocumentManager } from './document-manager.js';
import { DiagnosticsCache } from './diagnostics-cache.js';
import { adapterRegistry } from './adapters/registry.js';
import type { Config, Diagnostic, InitializeParams, LSPMessage, ServerConfig, ServerState } from './types.js';

const MAX_SESSIONS = 100;

export class ServerManager {
  private readonly servers = new Map<string, ServerState>();
  private readonly serversStarting = new Map<string, Promise<ServerState>>();

  async getServer(serverConfig: ServerConfig): Promise<ServerState> {
    const key = JSON.stringify(serverConfig);

    const existing = this.servers.get(key);
    if (existing) return existing;

    const starting = this.serversStarting.get(key);
    if (starting) return starting;

    if (this.servers.size >= MAX_SESSIONS) {
      throw new Error(`Max sessions (${MAX_SESSIONS}) reached — cannot start new LSP server`);
    }

    const promise = this.startServer(serverConfig);
    this.serversStarting.set(key, promise);

    try {
      const state = await promise;
      this.servers.set(key, state);
      return state;
    } finally {
      this.serversStarting.delete(key);
    }
  }

  getRunningServers(): Map<string, ServerState> {
    return this.servers;
  }

  async dispose(): Promise<void> {
    for (const state of this.servers.values()) {
      if (state.restartTimer) clearTimeout(state.restartTimer);
      try {
        await state.transport.sendRequest('shutdown', null, 5000);
      } catch { /* ignore */ }
      state.transport.sendNotification('exit', null);
      state.process.kill();
    }
    this.servers.clear();
  }

  async preloadServers(config: Config): Promise<void> {
    logger.info('Preloading LSP servers...\n');
    await Promise.allSettled(
      config.servers.map((sc) =>
        this.getServer(sc).catch((err) =>
          logger.error(`Failed to preload ${sc.command[0]}: ${err}\n`)
        )
      )
    );
    logger.info('LSP server preload complete\n');
  }

  private async startServer(serverConfig: ServerConfig): Promise<ServerState> {
    const [command, ...args] = serverConfig.command;
    if (!command) throw new Error('Server config has no command');

    logger.info(`Starting LSP server: ${serverConfig.command.join(' ')}\n`);

    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: serverConfig.rootDir ?? process.cwd(),
    });

    const adapter = adapterRegistry.getAdapter(serverConfig);
    if (adapter) logger.info(`Using adapter "${adapter.name}"\n`);

    let resolveInit: (() => void) | undefined;
    const initializationPromise = new Promise<void>((r) => { resolveInit = r; });

    const diagnosticsCache = new DiagnosticsCache();

    // Placeholder so we can reference serverState in handleMessage closure
    let serverState: ServerState;

    const transport = new JsonRpcTransport(child, (msg: LSPMessage) => {
      if (!msg.method || !serverState) return;

      // Let adapter handle custom requests from server
      if (msg.id !== undefined && adapter?.handleRequest) {
        adapter.handleRequest(msg.method, msg.params, serverState)
          .then((result) => transport.sendMessage({ jsonrpc: '2.0', id: msg.id, result }))
          .catch(() => { /* adapter didn't handle it */ });
        return;
      }

      if (msg.id === undefined && adapter?.handleNotification) {
        if (adapter.handleNotification(msg.method, msg.params, serverState)) return;
      }

      if (msg.method === 'initialized') {
        serverState.initialized = true;
        if (resolveInit) { resolveInit(); resolveInit = undefined; }
      } else if (msg.method === 'textDocument/publishDiagnostics') {
        const p = msg.params as { uri: string; diagnostics: Diagnostic[]; version?: number };
        if (p?.uri) diagnosticsCache.update(p.uri, p.diagnostics ?? [], p.version);
      }
    });

    const documentManager = new DocumentManager(transport);

    serverState = {
      process: child,
      transport,
      documentManager,
      diagnosticsCache,
      initialized: false,
      initializationPromise,
      initializationResolve: resolveInit,
      startTime: Date.now(),
      config: serverConfig,
      adapter,
    };

    child.stderr?.on('data', (data: Buffer) => process.stderr.write(data));

    child.on('exit', (code, signal) => {
      const key = JSON.stringify(serverConfig);
      logger.warn(`LSP server exited: ${serverConfig.command[0]} (code=${code}, signal=${signal})\n`);
      transport.rejectAllPending(`LSP server exited (code=${code})`);
      this.servers.delete(key);
    });

    child.on('error', (err) => {
      logger.error(`LSP server error: ${serverConfig.command[0]}: ${err}\n`);
      transport.rejectAllPending(`LSP server error: ${err.message}`);
      this.servers.delete(JSON.stringify(serverConfig));
    });

    // Build initialize params
    const initParams: InitializeParams = {
      processId: child.pid ?? null,
      clientInfo: { name: 'mcp-lsp', version: '0.1.0' },
      capabilities: {
        textDocument: {
          synchronization: { didOpen: true, didChange: true, didClose: true },
          definition: { linkSupport: false },
          references: { includeDeclaration: true, dynamicRegistration: false },
          rename: { prepareSupport: false },
          documentSymbol: {
            symbolKind: { valueSet: Array.from({ length: 26 }, (_, i) => i + 1) },
            hierarchicalDocumentSymbolSupport: true,
          },
          completion: { completionItem: { snippetSupport: true } },
          hover: {},
          signatureHelp: {},
          diagnostic: { dynamicRegistration: false, relatedDocumentSupport: false },
          callHierarchy: { dynamicRegistration: false },
          typeHierarchy: { dynamicRegistration: false },
          inlayHint: { dynamicRegistration: false },
        },
        workspace: {
          workspaceEdit: { documentChanges: true },
          workspaceFolders: true,
          symbol: { dynamicRegistration: false },
        },
      },
      rootUri: pathToUri(serverConfig.rootDir ?? process.cwd()),
      workspaceFolders: [
        {
          uri: pathToUri(serverConfig.rootDir ?? process.cwd()),
          name: 'workspace',
        },
      ],
    };

    if (serverConfig.initializationOptions !== undefined) {
      initParams.initializationOptions = serverConfig.initializationOptions;
    }

    const finalParams = adapter?.customizeInitializeParams
      ? adapter.customizeInitializeParams(initParams)
      : initParams;

    const initResult = await transport.sendRequest('initialize', finalParams, 60000);
    serverState.capabilities = (initResult as Record<string, unknown>)?.capabilities;
    transport.sendNotification('initialized', {});

    // Wait for initialized notification from server (with timeout)
    await Promise.race([
      initializationPromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('initialization timeout')), 5000)
      ),
    ]).catch(() => {
      // Mark initialized anyway — some servers never send the notification
      serverState.initialized = true;
    });

    return serverState;
  }
}
