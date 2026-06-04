import { z } from 'zod/v4';
import { getDocumentSymbols, getWorkspaceSymbols, symbolKindLabel, formatLocation } from '../operations.js';
import { getServerForFile } from '../server-resolver.js';
import type { Config, DocumentSymbol, SymbolInformation } from '../types.js';
import type { ServerManager } from '../server-manager.js';
import type { McpTool } from '../extensions/base.js';

function isDocumentSymbol(sym: DocumentSymbol | SymbolInformation): sym is DocumentSymbol {
  return 'selectionRange' in sym;
}

function renderDocumentSymbols(symbols: DocumentSymbol[], indent = 0): string {
  return symbols
    .map((s) => {
      const prefix = '  '.repeat(indent);
      const loc = `${s.range.start.line + 1}:${s.range.start.character + 1}`;
      const label = `${prefix}${symbolKindLabel(s.kind)} ${s.name}${s.detail ? ` — ${s.detail}` : ''} [${loc}]`;
      const children = s.children?.length
        ? '\n' + renderDocumentSymbols(s.children, indent + 1)
        : '';
      return label + children;
    })
    .join('\n');
}

export function symbolsTools(manager: ServerManager, config: Config): McpTool[] {
  return [
    {
      definition: {
        name: 'find_workspace_symbols',
        description: 'Search for symbols across the workspace by name.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Any file in the project (used to identify the LSP server)',
            },
            query: { type: 'string', description: 'Symbol name to search for' },
            max_results: { type: 'number', default: 50 },
          },
          required: ['file_path', 'query'],
        },
      },
      handler: async (args) => {
        const { file_path, query, max_results } = z.object({
          file_path: z.string(),
          query: z.string(),
          max_results: z.number().int().positive().optional().default(50),
        }).parse(args);

        const state = await getServerForFile(file_path, config, manager);
        const symbols = await getWorkspaceSymbols(state, query);
        const limited = symbols.slice(0, max_results);

        if (limited.length === 0) return 'No symbols found.';
        return limited
          .map((s) => `${symbolKindLabel(s.kind)} ${s.name} — ${formatLocation(s.location)}`)
          .join('\n');
      },
    },

    {
      definition: {
        name: 'find_document_symbols',
        description: 'List all symbols in a file as an outline tree.',
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
        const symbols = await getDocumentSymbols(state, file_path);

        if (symbols.length === 0) return 'No symbols found.';

        if (isDocumentSymbol(symbols[0]!)) {
          return renderDocumentSymbols(symbols as DocumentSymbol[]);
        }

        // SymbolInformation (flat)
        return (symbols as SymbolInformation[])
          .map((s) => `${symbolKindLabel(s.kind)} ${s.name} — ${formatLocation(s.location)}`)
          .join('\n');
      },
    },
  ];
}
