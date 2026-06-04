import type { InitializeParams, ServerAdapter, ServerConfig, ServerState } from '../types.js';

export class PyrightAdapter implements ServerAdapter {
  readonly name = 'pyright';

  matches(config: ServerConfig): boolean {
    return config.command.some((c) => c.includes('pyright') || c.includes('basedpyright'));
  }

  customizeInitializeParams(params: InitializeParams): InitializeParams {
    return {
      ...params,
      initializationOptions: {
        ...(typeof params.initializationOptions === 'object' && params.initializationOptions !== null
          ? params.initializationOptions
          : {}),
      },
    };
  }

  // Pyright analysis on first run can take 20-30s on large projects
  getTimeout(method: string): number | undefined {
    const timeouts: Record<string, number> = {
      'textDocument/definition': 45000,
      'textDocument/references': 60000,
      'textDocument/rename': 60000,
      'textDocument/documentSymbol': 45000,
      'workspace/symbol': 45000,
    };
    return timeouts[method];
  }

  handleNotification(_method: string, _params: unknown, _state: ServerState): boolean {
    return false;
  }
}
