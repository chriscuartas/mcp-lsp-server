import { z } from 'zod/v4';
import {
  getSignatureHelp,
  getInlayHints,
  getCompletions,
} from '../operations.js';
import { getServerForFile } from '../server-resolver.js';
import type { Config } from '../types.js';
import type { ServerManager } from '../server-manager.js';
import type { McpTool } from '../extensions/base.js';

const FilePositionSchema = z.object({
  file_path: z.string(),
  line: z.number().int().min(0),
  character: z.number().int().min(0),
});

export function intelligenceTools(manager: ServerManager, config: Config): McpTool[] {
  return [
    {
      definition: {
        name: 'get_signature_help',
        description: 'Get function signature information at the given position (for call sites).',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: { type: 'string' },
            line: { type: 'number' },
            character: { type: 'number' },
          },
          required: ['file_path', 'line', 'character'],
        },
      },
      handler: async (args) => {
        const { file_path, line, character } = FilePositionSchema.parse(args);
        const state = await getServerForFile(file_path, config, manager);
        const result = await getSignatureHelp(state, file_path, { line, character });

        if (!result || typeof result !== 'object') return 'No signature help available.';
        const sigResult = result as {
          signatures: Array<{ label: string; documentation?: string | { value: string }; parameters?: Array<{ label: string | [number, number] }> }>;
          activeSignature?: number;
          activeParameter?: number;
        };

        if (!sigResult.signatures?.length) return 'No signatures available.';

        const activeSig = sigResult.signatures[sigResult.activeSignature ?? 0];
        if (!activeSig) return 'No active signature.';

        const activeParam = sigResult.activeParameter ?? 0;
        const docText = typeof activeSig.documentation === 'string'
          ? activeSig.documentation
          : activeSig.documentation?.value ?? '';

        let output = `Signature: ${activeSig.label}`;
        if (docText) output += `\n${docText}`;
        if (activeSig.parameters?.length && activeParam < activeSig.parameters.length) {
          const param = activeSig.parameters[activeParam];
          const paramLabel = Array.isArray(param?.label)
            ? activeSig.label.substring(param.label[0], param.label[1])
            : param?.label ?? '';
          output += `\nActive parameter: ${paramLabel}`;
        }
        return output;
      },
    },

    {
      definition: {
        name: 'get_inlay_hints',
        description: 'Get inlay hints (inline type annotations) for a range of lines.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: { type: 'string' },
            start_line: { type: 'number' },
            end_line: { type: 'number' },
          },
          required: ['file_path', 'start_line', 'end_line'],
        },
      },
      handler: async (args) => {
        const { file_path, start_line, end_line } = z.object({
          file_path: z.string(),
          start_line: z.number().int().min(0),
          end_line: z.number().int().min(0),
        }).parse(args);

        const state = await getServerForFile(file_path, config, manager);
        const hints = await getInlayHints(state, file_path, {
          start: { line: start_line, character: 0 },
          end: { line: end_line, character: 9999 },
        });

        if (hints.length === 0) return 'No inlay hints for this range.';

        return hints
          .map((h) => {
            const hint = h as { position: { line: number; character: number }; label: string | Array<{ value: string }> };
            const label = Array.isArray(hint.label)
              ? hint.label.map((l) => l.value).join('')
              : hint.label;
            return `Line ${hint.position.line + 1}:${hint.position.character + 1} — ${label}`;
          })
          .join('\n');
      },
    },

    {
      definition: {
        name: 'get_completions',
        description: 'Get completion suggestions at the given position.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: { type: 'string' },
            line: { type: 'number' },
            character: { type: 'number' },
            trigger_character: { type: 'string' },
          },
          required: ['file_path', 'line', 'character'],
        },
      },
      handler: async (args) => {
        const { file_path, line, character, trigger_character } = z.object({
          file_path: z.string(),
          line: z.number().int().min(0),
          character: z.number().int().min(0),
          trigger_character: z.string().optional(),
        }).parse(args);

        const state = await getServerForFile(file_path, config, manager);
        const items = await getCompletions(
          state,
          file_path,
          { line, character },
          trigger_character
        );

        const top20 = items.slice(0, 20);
        if (top20.length === 0) return 'No completions available.';

        return top20
          .map((item) => {
            const i = item as { label: string; kind?: number; detail?: string };
            const kindMap: Record<number, string> = {
              1: 'text', 2: 'method', 3: 'function', 4: 'constructor', 5: 'field',
              6: 'variable', 7: 'class', 8: 'interface', 9: 'module', 10: 'property',
              11: 'unit', 12: 'value', 13: 'enum', 14: 'keyword', 15: 'snippet',
              16: 'color', 17: 'file', 18: 'reference', 19: 'folder', 20: 'enum_member',
              21: 'constant', 22: 'struct', 23: 'event', 24: 'operator', 25: 'type_parameter',
            };
            const kind = i.kind ? `[${kindMap[i.kind] ?? 'unknown'}]` : '';
            const detail = i.detail ? ` — ${i.detail}` : '';
            return `${kind} ${i.label}${detail}`;
          })
          .join('\n');
      },
    },
  ];
}
