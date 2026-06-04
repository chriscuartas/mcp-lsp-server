export interface McpTool {
  definition: {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  };
  handler: (args: Record<string, unknown>) => Promise<string>;
}

export interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface McpPrompt {
  name: string;
  description: string;
  arguments?: PromptArgument[];
  handler: (args: Record<string, string>) => Promise<{
    messages: Array<{ role: string; content: { type: string; text: string } }>;
  }>;
}

export interface Extension {
  name: string;
  prompts?: McpPrompt[];
}

export function registerExtensions(extensions: Extension[]): McpPrompt[] {
  return extensions.flatMap((ext) => ext.prompts ?? []);
}
