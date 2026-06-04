import { z } from 'zod/v4';
import { tryPositions } from '../multi-position.js';
import {
  prepareCallHierarchy,
  incomingCalls,
  outgoingCalls,
  prepareTypeHierarchy,
  typeHierarchySubtypes,
  typeHierarchySupertypes,
  formatLocation,
  uriToPath,
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

export function hierarchyTools(manager: ServerManager, config: Config): McpTool[] {
  return [
    {
      definition: {
        name: 'get_call_hierarchy_incoming',
        description: 'Find all callers of the function/method at the given position.',
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

        const items = await tryPositions(
          (l, c) => prepareCallHierarchy(state, file_path, { line: l, character: c })
            .then((r) => r.length ? r : null),
          line,
          character
        );

        if (!items || items.length === 0) {
          return 'Call hierarchy not available at this position (server may not support it).';
        }

        const allCalls = await incomingCalls(state, items[0]!);
        if (allCalls.length === 0) return 'No incoming callers found.';

        return allCalls
          .map((call) => {
            const loc = formatLocation({ uri: call.from.uri, range: call.from.selectionRange });
            return `${call.from.name} — ${loc}`;
          })
          .join('\n');
      },
    },

    {
      definition: {
        name: 'get_call_hierarchy_outgoing',
        description: 'Find all functions/methods called by the function at the given position.',
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

        const items = await tryPositions(
          (l, c) => prepareCallHierarchy(state, file_path, { line: l, character: c })
            .then((r) => r.length ? r : null),
          line,
          character
        );

        if (!items || items.length === 0) {
          return 'Call hierarchy not available at this position.';
        }

        const allCalls = await outgoingCalls(state, items[0]!);
        if (allCalls.length === 0) return 'No outgoing calls found.';

        return allCalls
          .map((call) => {
            const loc = formatLocation({ uri: call.to.uri, range: call.to.selectionRange });
            return `${call.to.name} — ${loc}`;
          })
          .join('\n');
      },
    },

    {
      definition: {
        name: 'get_type_hierarchy_subtypes',
        description: 'Find all classes that implement or extend the type at the given position.',
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

        const items = await tryPositions(
          (l, c) => prepareTypeHierarchy(state, file_path, { line: l, character: c })
            .then((r) => r.length ? r : null),
          line,
          character
        );

        if (!items || items.length === 0) {
          return 'Type hierarchy not available at this position.';
        }

        const subtypes = await typeHierarchySubtypes(state, items[0]!);
        if (subtypes.length === 0) return 'No subtypes found.';

        return subtypes
          .map((t) => `${t.name} — ${uriToPath(t.uri)}:${t.range.start.line + 1}`)
          .join('\n');
      },
    },

    {
      definition: {
        name: 'get_type_hierarchy_supertypes',
        description: 'Find all parent classes/interfaces of the type at the given position.',
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

        const items = await tryPositions(
          (l, c) => prepareTypeHierarchy(state, file_path, { line: l, character: c })
            .then((r) => r.length ? r : null),
          line,
          character
        );

        if (!items || items.length === 0) {
          return 'Type hierarchy not available at this position.';
        }

        const supertypes = await typeHierarchySupertypes(state, items[0]!);
        if (supertypes.length === 0) return 'No supertypes found.';

        return supertypes
          .map((t) => `${t.name} — ${uriToPath(t.uri)}:${t.range.start.line + 1}`)
          .join('\n');
      },
    },
  ];
}
