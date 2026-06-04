import { z } from 'zod/v4';
import { tryPositions } from '../multi-position.js';
import {
  findDefinition,
  findReferences,
  findImplementations,
  getHover,
  formatLocations,
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

export function navigationTools(manager: ServerManager, config: Config): McpTool[] {
  return [
    {
      definition: {
        name: 'find_definition',
        description: 'Find the definition of a symbol at the given position.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Absolute path to the file' },
            line: { type: 'number', description: '0-based line number' },
            character: { type: 'number', description: '0-based character offset' },
          },
          required: ['file_path', 'line', 'character'],
        },
      },
      handler: async (args) => {
        const { file_path, line, character } = FilePositionSchema.parse(args);
        const state = await getServerForFile(file_path, config, manager);
        const locations = await tryPositions(
          (l, c) => findDefinition(state, file_path, { line: l, character: c }).then((r) => r.length ? r : null),
          line,
          character
        );
        return formatLocations(locations ?? []);
      },
    },

    {
      definition: {
        name: 'find_references',
        description: 'Find all references to the symbol at the given position.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: { type: 'string' },
            line: { type: 'number' },
            character: { type: 'number' },
            include_declaration: { type: 'boolean', default: true },
          },
          required: ['file_path', 'line', 'character'],
        },
      },
      handler: async (args) => {
        const parsed = FilePositionSchema.extend({
          include_declaration: z.boolean().optional().default(true),
        }).parse(args);
        const { file_path, line, character, include_declaration } = parsed;
        const state = await getServerForFile(file_path, config, manager);
        const locs = await tryPositions(
          (l, c) => findReferences(state, file_path, { line: l, character: c }, include_declaration)
            .then((r) => r.length ? r : null),
          line,
          character
        );
        return formatLocations(locs ?? []);
      },
    },

    {
      definition: {
        name: 'find_implementations',
        description: 'Find implementations of the interface or abstract method at the given position.',
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
        const locs = await tryPositions(
          (l, c) => findImplementations(state, file_path, { line: l, character: c })
            .then((r) => r.length ? r : null),
          line,
          character
        );
        return formatLocations(locs ?? []);
      },
    },

    {
      definition: {
        name: 'get_hover',
        description: 'Get hover information (type info, docs) for the symbol at the given position.',
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
        const result = await tryPositions(
          (l, c) => getHover(state, file_path, { line: l, character: c }),
          line,
          character
        );
        if (!result) return 'No hover information available.';
        const { contents } = result;
        if (typeof contents === 'string') return contents;
        if (typeof contents === 'object' && contents !== null && 'value' in contents) {
          return (contents as { value: string }).value;
        }
        if (Array.isArray(contents)) {
          return (contents as Array<string | { value: string }>)
            .map((c) => (typeof c === 'string' ? c : c.value))
            .join('\n\n');
        }
        return JSON.stringify(contents);
      },
    },
  ];
}
