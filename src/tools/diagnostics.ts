import { z } from 'zod/v4';
import { getDiagnosticsForFile, formatLocation, severityLabel } from '../operations.js';
import { getServerForFile } from '../server-resolver.js';
import type { Config } from '../types.js';
import type { ServerManager } from '../server-manager.js';
import type { McpTool } from '../extensions/base.js';

export function diagnosticsTools(manager: ServerManager, config: Config): McpTool[] {
  return [
    {
      definition: {
        name: 'get_diagnostics',
        description:
          'Get LSP diagnostics (errors, warnings, hints) for a file or workspace.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Absolute path to the file' },
          },
          required: ['file_path'],
        },
      },
      handler: async (args) => {
        const { file_path } = z.object({ file_path: z.string() }).parse(args);
        const state = await getServerForFile(file_path, config, manager);
        const diags = await getDiagnosticsForFile(state, file_path);

        if (diags.length === 0) return 'No diagnostics.';

        return diags
          .map((d) => {
            const loc = formatLocation({ uri: `file://${file_path}`, range: d.range });
            const sev = severityLabel(d.severity);
            const src = d.source ? `[${d.source}] ` : '';
            const code = d.code ? ` (${d.code})` : '';
            return `${loc}: [${sev}] ${src}${d.message}${code}`;
          })
          .join('\n');
      },
    },
  ];
}
