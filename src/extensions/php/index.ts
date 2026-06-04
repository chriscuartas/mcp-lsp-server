import type { Extension } from '../base.js';

export const phpExtension: Extension = {
  name: 'php-laravel',
  prompts: [
    {
      name: 'resolve-facade',
      description:
        'Resolve a Laravel Facade class to its underlying concrete binding. ' +
        'Provide the facade class name and project root; returns the concrete class and file location.',
      arguments: [
        { name: 'facade_class', description: 'The Facade class name (e.g. "Auth", "Cache")', required: true },
        { name: 'root_uri', description: 'Absolute path to the project root', required: true },
      ],
      handler: async (args) => {
        const { facade_class, root_uri } = args;
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: [
                  `Resolve the Laravel Facade "${facade_class}" in the project at "${root_uri}".`,
                  '',
                  'Steps:',
                  `1. Use find_workspace_symbols with query="${facade_class}" and any PHP file in ${root_uri} as file_path`,
                  '2. Use find_definition on the symbol to locate the Facade class file',
                  '3. Use get_hover on the getFacadeAccessor method to identify the binding key',
                  '4. Search for that key in AppServiceProvider or any provider to find the concrete class',
                  '',
                  'Return: concrete class name, file path, and the service container binding key.',
                ].join('\n'),
              },
            },
          ],
        };
      },
    },

    {
      name: 'find-model-callers',
      description:
        'Find all controllers, services, and jobs that reference a given Eloquent model class.',
      arguments: [
        { name: 'model_class', description: 'The Eloquent model class name (e.g. "User", "Order")', required: true },
        { name: 'model_file', description: 'Absolute path to the model file', required: true },
      ],
      handler: async (args) => {
        const { model_class, model_file } = args;
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: [
                  `Find all callers of the Eloquent model "${model_class}" in the project.`,
                  '',
                  'Steps:',
                  `1. Use find_workspace_symbols with query="${model_class}" and file_path="${model_file}"`,
                  '2. Use find_references on the class symbol to get all usages',
                  '3. Group the results by directory (Controllers/, Services/, Jobs/, etc.)',
                  '',
                  'Return a grouped summary of: which controllers, services, and jobs reference this model, with file paths.',
                ].join('\n'),
              },
            },
          ],
        };
      },
    },
  ],
};
