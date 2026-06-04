import { z } from 'zod/v4';
import { getServerForFile } from '../server-resolver.js';
import type { Config } from '../types.js';
import type { ServerManager } from '../server-manager.js';
import type { McpTool } from '../extensions/base.js';

export function metaTools(manager: ServerManager, config: Config): McpTool[] {
  return [
    {
      definition: {
        name: 'start_lsp',
        description: 'Start an LSP session for a given file (triggers server startup if not running).',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Any file in the project' },
          },
          required: ['file_path'],
        },
      },
      handler: async (args) => {
        const { file_path } = z.object({ file_path: z.string() }).parse(args);
        const state = await getServerForFile(file_path, config, manager);
        const uptime = Math.round((Date.now() - state.startTime) / 1000);
        return `LSP server "${state.config.command[0]}" is running (uptime: ${uptime}s).`;
      },
    },

    {
      definition: {
        name: 'restart_lsp',
        description: 'Restart one or all LSP servers. Specify a file to restart only the server for that file.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Optional — restricts restart to this file\'s server' },
          },
          required: [],
        },
      },
      handler: async (args) => {
        const { file_path } = z.object({ file_path: z.string().optional() }).parse(args);

        const running = manager.getRunningServers();

        if (file_path) {
          const ext = file_path.split('.').pop()?.toLowerCase() ?? '';
          const toRestart = [...running.entries()].filter(([, state]) =>
            state.config.extensions.includes(ext)
          );
          if (toRestart.length === 0) return `No running server for .${ext} files.`;

          await manager.dispose();
          return `Restarted ${toRestart.length} server(s) for .${ext} files.`;
        }

        const count = running.size;
        await manager.dispose();
        return `Restarted all ${count} running LSP server(s).`;
      },
    },

    {
      definition: {
        name: 'get_server_capabilities',
        description: 'Show the capabilities reported by the language server for a given file.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: { type: 'string' },
          },
          required: ['file_path'],
        },
      },
      handler: async (args) => {
        const { file_path } = z.object({ file_path: z.string() }).parse(args);
        const state = await getServerForFile(file_path, config, manager);

        if (!state.capabilities) return 'No capability data available (server may not have responded yet).';
        return JSON.stringify(state.capabilities, null, 2);
      },
    },

    {
      definition: {
        name: 'list_active_sessions',
        description: 'List all currently running LSP server sessions.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      handler: async () => {
        const sessions = [...manager.getRunningServers().values()];
        if (sessions.length === 0) return 'No active LSP sessions.';

        const rows = sessions.map((s) => {
          const cmd = s.config.command.join(' ');
          const root = s.config.rootDir ?? process.cwd();
          const uptime = Math.round((Date.now() - s.startTime) / 1000);
          const pid = s.process.pid ?? 'unknown';
          return `${cmd}\n  rootDir: ${root}\n  pid: ${pid}\n  uptime: ${uptime}s`;
        });

        return rows.join('\n\n');
      },
    },
  ];
}
