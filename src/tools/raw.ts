import { z } from 'zod/v4';
import { getServerForFile } from '../server-resolver.js';
import type { Config } from '../types.js';
import type { ServerManager } from '../server-manager.js';
import type { McpTool } from '../extensions/base.js';

export function rawTools(manager: ServerManager, config: Config): McpTool[] {
  return [
    {
      definition: {
        name: 'lsp_list_methods',
        description: 'List all standard LSP method names from the LSP specification.',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      handler: async () => {
        // Well-known LSP 3.17 methods
        const methods = [
          'initialize', 'initialized', 'shutdown', 'exit',
          'textDocument/didOpen', 'textDocument/didChange', 'textDocument/didClose',
          'textDocument/didSave', 'textDocument/definition', 'textDocument/typeDefinition',
          'textDocument/declaration', 'textDocument/references', 'textDocument/implementation',
          'textDocument/hover', 'textDocument/documentSymbol', 'textDocument/rename',
          'textDocument/prepareRename', 'textDocument/codeAction', 'textDocument/codeLens',
          'textDocument/completion', 'textDocument/signatureHelp', 'textDocument/formatting',
          'textDocument/rangeFormatting', 'textDocument/onTypeFormatting', 'textDocument/diagnostic',
          'textDocument/prepareCallHierarchy', 'callHierarchy/incomingCalls', 'callHierarchy/outgoingCalls',
          'textDocument/prepareTypeHierarchy', 'typeHierarchy/subtypes', 'typeHierarchy/supertypes',
          'textDocument/inlayHint', 'textDocument/semanticTokens/full',
          'workspace/symbol', 'workspace/diagnostic', 'workspace/executeCommand',
          'textDocument/publishDiagnostics', 'window/showMessage', 'window/logMessage',
        ];
        return methods.join('\n');
      },
    },

    {
      definition: {
        name: 'lsp_raw_request',
        description:
          'Send a raw LSP request directly to a language server. Requires enableRawMode in config.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'File used to identify the server' },
            method: { type: 'string', description: 'LSP method name' },
            params: { description: 'Request params (any JSON value)' },
          },
          required: ['file_path', 'method'],
        },
      },
      handler: async (args) => {
        const { file_path, method, params } = z.object({
          file_path: z.string(),
          method: z.string(),
          params: z.unknown().optional(),
        }).parse(args);

        const state = await getServerForFile(file_path, config, manager);
        await state.initializationPromise;

        const result = await state.transport.sendRequest(method, params ?? null, 60000);
        return JSON.stringify(result, null, 2);
      },
    },
  ];
}
