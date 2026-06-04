import { readFileSync } from 'node:fs';
import { logger } from './logger.js';
import { pathToUri } from './utils.js';
import type { JsonRpcTransport } from './json-rpc.js';

const LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescriptreact',
  js: 'javascript', jsx: 'javascriptreact',
  php: 'php',
  py: 'python',
  go: 'go', rs: 'rust',
  c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
  java: 'java', cs: 'csharp',
  rb: 'ruby', swift: 'swift', kt: 'kotlin',
  lua: 'lua', sh: 'shellscript',
  json: 'json', yaml: 'yaml', yml: 'yaml',
  xml: 'xml', html: 'html', css: 'css', scss: 'scss',
  vue: 'vue', svelte: 'svelte', sql: 'sql', md: 'markdown',
};

export function getLanguageId(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return LANGUAGE_MAP[ext] ?? 'plaintext';
}

export class DocumentManager {
  private readonly openFiles = new Set<string>();
  private readonly fileVersions = new Map<string, number>();

  constructor(private readonly transport: JsonRpcTransport) {}

  async ensureOpen(filePath: string): Promise<boolean> {
    if (this.openFiles.has(filePath)) return false;

    logger.debug(`Opening file: ${filePath}\n`);
    const text = readFileSync(filePath, 'utf-8');
    const uri = pathToUri(filePath);
    const languageId = getLanguageId(filePath);

    this.transport.sendNotification('textDocument/didOpen', {
      textDocument: { uri, languageId, version: 1, text },
    });

    this.openFiles.add(filePath);
    this.fileVersions.set(filePath, 1);
    return true;
  }

  sendChange(filePath: string, text: string): void {
    const uri = pathToUri(filePath);
    const version = (this.fileVersions.get(filePath) ?? 1) + 1;
    this.fileVersions.set(filePath, version);

    this.transport.sendNotification('textDocument/didChange', {
      textDocument: { uri, version },
      contentChanges: [{ text }],
    });
  }

  isOpen(filePath: string): boolean {
    return this.openFiles.has(filePath);
  }

  getVersion(filePath: string): number {
    return this.fileVersions.get(filePath) ?? 0;
  }
}
