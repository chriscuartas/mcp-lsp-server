import { logger } from './logger.js';
import type { Diagnostic } from './types.js';

export class DiagnosticsCache {
  private diagnostics = new Map<string, Diagnostic[]>();
  private lastUpdate = new Map<string, number>();
  private versions = new Map<string, number>();

  update(uri: string, items: Diagnostic[], version?: number): void {
    this.diagnostics.set(uri, items);
    this.lastUpdate.set(uri, Date.now());
    if (version !== undefined) this.versions.set(uri, version);
  }

  get(uri: string): Diagnostic[] | undefined {
    return this.diagnostics.get(uri);
  }

  async waitForIdle(
    uri: string,
    opts: { maxWaitTime?: number; idleTime?: number; checkInterval?: number } = {}
  ): Promise<void> {
    const { maxWaitTime = 5000, idleTime = 300, checkInterval = 50 } = opts;
    const start = Date.now();
    let lastVersion = this.versions.get(uri) ?? -1;

    logger.debug(`Waiting for diagnostics idle: ${uri}\n`);

    while (Date.now() - start < maxWaitTime) {
      await new Promise((r) => setTimeout(r, checkInterval));
      const currentVersion = this.versions.get(uri) ?? -1;

      if (currentVersion !== lastVersion) {
        lastVersion = currentVersion;
        continue;
      }

      const lastTs = this.lastUpdate.get(uri) ?? start;
      if (Date.now() - lastTs >= idleTime) return;
    }

    logger.debug(`Diagnostics idle wait timed out for ${uri}\n`);
  }
}
