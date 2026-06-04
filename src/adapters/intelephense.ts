import os from 'node:os';
import path from 'node:path';
import type { InitializeParams, ServerAdapter, ServerConfig, ServerState } from '../types.js';

export class IntelephenseAdapter implements ServerAdapter {
  readonly name = 'intelephense';

  matches(config: ServerConfig): boolean {
    return config.command.some((c) => c.includes('intelephense'));
  }

  customizeInitializeParams(params: InitializeParams): InitializeParams {
    const licenceKey = process.env['INTELEPHENSE_LICENCE_KEY'];
    return {
      ...params,
      initializationOptions: {
        ...(typeof params.initializationOptions === 'object' && params.initializationOptions !== null
          ? params.initializationOptions
          : {}),
        licenceKey: licenceKey ?? undefined,
        clearCache: false,
        storagePath: path.join(os.tmpdir(), 'intelephense'),
      },
    };
  }

  getTimeout(method: string): number | undefined {
    const timeouts: Record<string, number> = {
      'textDocument/definition': 30000,
      'textDocument/references': 45000,
      'workspace/symbol': 30000,
    };
    return timeouts[method];
  }

  handleNotification(_method: string, _params: unknown, _state: ServerState): boolean {
    return false;
  }
}
