import { z } from 'zod/v4';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { tryPositions } from '../multi-position.js';
import { renameSymbol as opRename, getCodeActions, uriToPath } from '../operations.js';
import { getServerForFile } from '../server-resolver.js';
import type { Config, Position } from '../types.js';
import type { ServerManager } from '../server-manager.js';
import type { McpTool } from '../extensions/base.js';

export function refactoringTools(manager: ServerManager, config: Config): McpTool[] {
  return [
    {
      definition: {
        name: 'rename_symbol',
        description: 'Rename a symbol everywhere it is used in the workspace.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: { type: 'string' },
            line: { type: 'number' },
            character: { type: 'number' },
            new_name: { type: 'string' },
            dry_run: { type: 'boolean', default: true },
          },
          required: ['file_path', 'line', 'character', 'new_name'],
        },
      },
      handler: async (args) => {
        const { file_path, line, character, new_name, dry_run } = z.object({
          file_path: z.string(),
          line: z.number().int().min(0),
          character: z.number().int().min(0),
          new_name: z.string().min(1),
          dry_run: z.boolean().optional().default(true),
        }).parse(args);

        const state = await getServerForFile(file_path, config, manager);
        const changes = await tryPositions(
          (l, c) => opRename(state, file_path, { line: l, character: c }, new_name)
            .then((r) => Object.keys(r).length ? r : null),
          line,
          character
        );

        if (!changes || Object.keys(changes).length === 0) {
          return 'No rename changes returned by the language server.';
        }

        const fileEdits = Object.entries(changes);
        const summary = fileEdits
          .map(([uri, edits]) => {
            const path = uriToPath(uri);
            return `${path}: ${edits.length} edit(s)`;
          })
          .join('\n');

        if (dry_run) {
          const details = fileEdits
            .map(([uri, edits]) => {
              const path = uriToPath(uri);
              const editList = edits
                .map(
                  (e) =>
                    `  Line ${e.range.start.line + 1}:${e.range.start.character + 1}–${e.range.end.line + 1}:${e.range.end.character + 1} → "${e.newText}"`
                )
                .join('\n');
              return `${path}:\n${editList}`;
            })
            .join('\n\n');
          return `[DRY RUN] Would rename to "${new_name}" in ${fileEdits.length} file(s):\n\n${details}`;
        }

        // Apply atomically with .bak backups
        const backed: string[] = [];
        try {
          // Backup phase
          for (const [uri] of fileEdits) {
            const path = uriToPath(uri);
            if (existsSync(path)) {
              const bak = `${path}.bak`;
              writeFileSync(bak, readFileSync(path));
              backed.push(path);
            }
          }

          // Apply phase — apply edits in reverse order so offsets don't shift
          for (const [uri, edits] of fileEdits) {
            const path = uriToPath(uri);
            const content = readFileSync(path, 'utf-8');
            const lines = content.split('\n');

            const sorted = [...edits].sort((a, b) => {
              const lineDiff = b.range.start.line - a.range.start.line;
              return lineDiff !== 0 ? lineDiff : b.range.start.character - a.range.start.character;
            });

            for (const edit of sorted) {
              const { start, end } = edit.range;
              if (start.line === end.line) {
                const line = lines[start.line] ?? '';
                lines[start.line] =
                  line.substring(0, start.character) +
                  edit.newText +
                  line.substring(end.character);
              } else {
                const firstLine = lines[start.line] ?? '';
                const lastLine = lines[end.line] ?? '';
                const replacement =
                  firstLine.substring(0, start.character) +
                  edit.newText +
                  lastLine.substring(end.character);
                lines.splice(start.line, end.line - start.line + 1, replacement);
              }
            }

            writeFileSync(path, lines.join('\n'));
          }

          // Remove backups only after all writes succeeded
          for (const path of backed) {
            const bak = `${path}.bak`;
            if (existsSync(bak)) {
              // Remove the bak by overwriting then renaming back
              // (can't delete without extra fs import — use renameSync to clear)
              const { unlinkSync } = await import('node:fs');
              unlinkSync(bak);
            }
          }

          return `Renamed to "${new_name}" in ${fileEdits.length} file(s):\n${summary}`;
        } catch (err) {
          // Restore backups
          for (const path of backed) {
            const bak = `${path}.bak`;
            if (existsSync(bak)) {
              writeFileSync(path, readFileSync(bak));
            }
          }
          throw new Error(`Rename failed and was rolled back: ${err}`);
        }
      },
    },

    {
      definition: {
        name: 'get_code_actions',
        description: 'List available code actions (quick fixes, refactors) for a range.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: { type: 'string' },
            start_line: { type: 'number' },
            start_character: { type: 'number' },
            end_line: { type: 'number' },
            end_character: { type: 'number' },
          },
          required: ['file_path', 'start_line', 'start_character', 'end_line', 'end_character'],
        },
      },
      handler: async (args) => {
        const { file_path, start_line, start_character, end_line, end_character } = z.object({
          file_path: z.string(),
          start_line: z.number().int().min(0),
          start_character: z.number().int().min(0),
          end_line: z.number().int().min(0),
          end_character: z.number().int().min(0),
        }).parse(args);

        const state = await getServerForFile(file_path, config, manager);
        const actions = await getCodeActions(state, file_path, {
          start: { line: start_line, character: start_character } as Position,
          end: { line: end_line, character: end_character } as Position,
        });

        if (actions.length === 0) return 'No code actions available.';
        return actions
          .map((a) => {
            const action = a as { title: string; kind?: string };
            return `${action.kind ? `[${action.kind}] ` : ''}${action.title}`;
          })
          .join('\n');
      },
    },
  ];
}
