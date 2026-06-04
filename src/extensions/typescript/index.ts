import type { Extension } from '../base.js';

export const typescriptExtension: Extension = {
  name: 'typescript-react',
  prompts: [
    {
      name: 'analyze-hooks-deps',
      description:
        'Analyze a React component file for hooks with incorrect or missing dependency arrays. ' +
        'Uses find_document_symbols and find_references to cross-check declared deps against actual usage.',
      arguments: [
        { name: 'file_path', description: 'Absolute path to the React component file', required: true },
      ],
      handler: async (args) => {
        const { file_path } = args;
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: [
                  `Analyze the React hooks dependency arrays in "${file_path}".`,
                  '',
                  'Steps:',
                  `1. Use find_document_symbols with file_path="${file_path}" to get the file outline`,
                  '2. Identify all useEffect, useCallback, and useMemo calls and their dependency arrays',
                  '3. For each dependency listed in the array, use find_references to confirm it is actually used inside the hook body',
                  '4. Identify any values used inside hook bodies that are NOT in the dependency array',
                  '',
                  'Return: a list of hooks with their current deps, missing deps (used but not declared), and stale deps (declared but not used in the body).',
                ].join('\n'),
              },
            },
          ],
        };
      },
    },
  ],
};
