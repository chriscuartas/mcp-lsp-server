import type { InitializeParams, ServerAdapter, ServerConfig, ServerState } from '../types.js';

export class PhpactorAdapter implements ServerAdapter {
  readonly name = 'phpactor';

  matches(config: ServerConfig): boolean {
    return config.command.some((c) => c.includes('phpactor'));
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

  handleNotification(_method: string, _params: unknown, _state: ServerState): boolean {
    return false;
  }
}
