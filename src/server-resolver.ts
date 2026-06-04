import { normalize, relative } from 'node:path';
import type { Config, ServerConfig, ServerState } from './types.js';
import type { ServerManager } from './server-manager.js';

/**
 * Find the best matching server config for a file path, then start/get the
 * session. Uses the most-specific rootDir match when multiple servers support
 * the same extension.
 */
export async function getServerForFile(
  filePath: string,
  config: Config,
  manager: ServerManager
): Promise<ServerState> {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const matches = config.servers.filter((s) => s.extensions.includes(ext));

  if (matches.length === 0) {
    throw new Error(`No LSP server configured for extension .${ext} (file: ${filePath})`);
  }

  const serverConfig = selectBestMatch(filePath, matches);
  return manager.getServer(serverConfig);
}

function selectBestMatch(filePath: string, servers: ServerConfig[]): ServerConfig {
  if (servers.length === 1) return servers[0]!;

  const absFile = normalize(filePath);
  let best: ServerConfig = servers[0]!;
  let longestRoot = -1;

  for (const s of servers) {
    if (!s.rootDir) continue;
    const absRoot = normalize(s.rootDir);
    const rel = relative(absRoot, absFile);
    if (!rel.startsWith('..') && absRoot.length > longestRoot) {
      longestRoot = absRoot.length;
      best = s;
    }
  }

  return best;
}
