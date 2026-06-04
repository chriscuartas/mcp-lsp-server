import type { ServerAdapter, ServerConfig } from '../types.js';
import { IntelephenseAdapter } from './intelephense.js';
import { PhpactorAdapter } from './phpactor.js';
import { PyrightAdapter } from './pyright.js';

class AdapterRegistry {
  private readonly adapters: ServerAdapter[] = [
    new IntelephenseAdapter(),
    new PhpactorAdapter(),
    new PyrightAdapter(),
  ];

  getAdapter(config: ServerConfig): ServerAdapter | undefined {
    return this.adapters.find((a) => a.matches(config));
  }
}

export const adapterRegistry = new AdapterRegistry();
