import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourceTemplatesRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from './config.js';
import { ServerManager } from './server-manager.js';
import { navigationTools } from './tools/navigation.js';
import { diagnosticsTools } from './tools/diagnostics.js';
import { symbolsTools } from './tools/symbols.js';
import { refactoringTools } from './tools/refactoring.js';
import { hierarchyTools } from './tools/hierarchy.js';
import { intelligenceTools } from './tools/intelligence.js';
import { metaTools } from './tools/meta.js';
import { rawTools } from './tools/raw.js';
import { registerExtensions } from './extensions/base.js';
import { phpExtension } from './extensions/php/index.js';
import { typescriptExtension } from './extensions/typescript/index.js';
import { diagnosticsResource } from './resources/diagnostics.js';
import type { McpTool, McpPrompt } from './extensions/base.js';

async function main() {
  const config = loadConfig();
  const serverManager = new ServerManager();

  const server = new Server(
    { name: 'mcp-lsp', version: '0.1.0' },
    {
      capabilities: {
        tools: {},
        prompts: {},
        resources: { subscribe: true },
      },
    }
  );

  const allTools: McpTool[] = [
    ...navigationTools(serverManager, config),
    ...diagnosticsTools(serverManager, config),
    ...symbolsTools(serverManager, config),
    ...refactoringTools(serverManager, config),
    ...hierarchyTools(serverManager, config),
    ...intelligenceTools(serverManager, config),
    ...metaTools(serverManager, config),
    ...(config.enableRawMode ? rawTools(serverManager, config) : []),
  ];

  const extensions = [phpExtension, typescriptExtension];
  const allPrompts: McpPrompt[] = registerExtensions(extensions);

  const toolMap = new Map(allTools.map((t) => [t.definition.name, t.handler]));
  const promptMap = new Map(allPrompts.map((p) => [p.name, p.handler]));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map((t) => t.definition),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const handler = toolMap.get(request.params.name);
    if (!handler) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
        isError: true,
      };
    }
    try {
      const result = await handler(request.params.arguments ?? {});
      return { content: [{ type: 'text', text: result }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: msg }], isError: true };
    }
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: allPrompts.map((p) => ({
      name: p.name,
      description: p.description,
      arguments: p.arguments,
    })),
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const handler = promptMap.get(request.params.name);
    if (!handler) {
      throw new Error(`Unknown prompt: ${request.params.name}`);
    }
    return handler(request.params.arguments ?? {});
  });

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [diagnosticsResource.template],
  }));

  const transport = new StdioServerTransport();

  const shutdown = async () => {
    await serverManager.dispose();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await server.connect(transport);

  // Preload servers in background after MCP connection is established
  serverManager.preloadServers(config).catch(() => { /* non-fatal */ });
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
