import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { Config } from './types.js';

const ServerConfigSchema = z.object({
  extensions: z.array(z.string()),
  command: z.array(z.string()).min(1),
  rootDir: z.string().optional(),
  initializationOptions: z.unknown().optional(),
});

const ConfigSchema = z.object({
  servers: z.array(ServerConfigSchema),
  enableRawMode: z.boolean().optional(),
});

const DEFAULT_SERVERS = [
  {
    extensions: ['php'],
    command: ['intelephense', '--stdio'],
  },
  {
    extensions: ['ts', 'tsx', 'js', 'jsx'],
    command: ['typescript-language-server', '--stdio'],
  },
  {
    extensions: ['py'],
    command: ['pylsp'],
  },
];

export function loadConfig(configPath?: string): Config {
  // 1. Env var override
  const envPath = process.env['MCP_LSP_CONFIG'];
  if (envPath) {
    if (!existsSync(envPath)) {
      throw new Error(`MCP_LSP_CONFIG points to missing file: ${envPath}`);
    }
    return parseConfig(envPath);
  }

  // 2. Explicit path
  if (configPath && existsSync(configPath)) {
    return parseConfig(configPath);
  }

  // 3. Auto-discover from cwd
  const cwdConfig = join(process.cwd(), '.claude', 'mcp-lsp.json');
  if (existsSync(cwdConfig)) {
    return parseConfig(cwdConfig);
  }

  // 4. Built-in defaults
  return { servers: DEFAULT_SERVERS };
}

function parseConfig(filePath: string): Config {
  const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid mcp-lsp.json at ${filePath}: ${result.error.message}`);
  }
  return result.data;
}
