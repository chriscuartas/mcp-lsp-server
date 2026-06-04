import { readFileSync } from 'node:fs';
import { logger } from './logger.js';
import { pathToUri, uriToPath } from './utils.js';
import type {
  CallHierarchyIncomingCall,
  CallHierarchyItem,
  CallHierarchyOutgoingCall,
  Diagnostic,
  DocumentSymbol,
  Location,
  Position,
  ServerState,
  SymbolInformation,
  TypeHierarchyItem,
} from './types.js';

async function ensureAndWait(state: ServerState, filePath: string): Promise<void> {
  await state.initializationPromise;
  const opened = await state.documentManager.ensureOpen(filePath);
  if (opened) {
    // Give server a moment to index after first open
    await new Promise((r) => setTimeout(r, 200));
  }
}

function timeout(state: ServerState, method: string, fallback = 30000): number {
  return state.adapter?.getTimeout?.(method) ?? fallback;
}

// ─── Navigation ───────────────────────────────────────────────────────────────

export async function findDefinition(
  state: ServerState,
  filePath: string,
  position: Position
): Promise<Location[]> {
  await ensureAndWait(state, filePath);
  const method = 'textDocument/definition';
  const result = await state.transport.sendRequest(
    method,
    { textDocument: { uri: pathToUri(filePath) }, position },
    timeout(state, method)
  );
  return normalizeLocations(result);
}

export async function findReferences(
  state: ServerState,
  filePath: string,
  position: Position,
  includeDeclaration = true
): Promise<Location[]> {
  await ensureAndWait(state, filePath);
  const method = 'textDocument/references';
  const result = await state.transport.sendRequest(
    method,
    { textDocument: { uri: pathToUri(filePath) }, position, context: { includeDeclaration } },
    timeout(state, method)
  );
  return normalizeLocations(result);
}

export async function findImplementations(
  state: ServerState,
  filePath: string,
  position: Position
): Promise<Location[]> {
  await ensureAndWait(state, filePath);
  const method = 'textDocument/implementation';
  const result = await state.transport.sendRequest(
    method,
    { textDocument: { uri: pathToUri(filePath) }, position },
    timeout(state, method)
  );
  return normalizeLocations(result);
}

export async function getHover(
  state: ServerState,
  filePath: string,
  position: Position
): Promise<{ contents: unknown; range?: unknown } | null> {
  await ensureAndWait(state, filePath);
  const method = 'textDocument/hover';
  const result = await state.transport.sendRequest(
    method,
    { textDocument: { uri: pathToUri(filePath) }, position },
    timeout(state, method)
  );
  if (result && typeof result === 'object' && 'contents' in result) {
    return result as { contents: unknown; range?: unknown };
  }
  return null;
}

// ─── Diagnostics ──────────────────────────────────────────────────────────────

export async function getDiagnosticsForFile(
  state: ServerState,
  filePath: string
): Promise<Diagnostic[]> {
  await ensureAndWait(state, filePath);
  const uri = pathToUri(filePath);

  // Try cached first (publishDiagnostics notifications)
  const cached = state.diagnosticsCache.get(uri);
  if (cached !== undefined) return cached;

  // Try pull-based textDocument/diagnostic
  try {
    const result = await state.transport.sendRequest(
      'textDocument/diagnostic',
      { textDocument: { uri } },
      30000
    );
    if (result && typeof result === 'object' && 'kind' in result) {
      const report = result as { kind: string; items?: Diagnostic[] };
      if (report.kind === 'full' && report.items) return report.items;
      if (report.kind === 'unchanged') return [];
    }
  } catch {
    // Server doesn't support pull-based diagnostics — fall through to push-based wait
  }

  // Wait for publishDiagnostics notification
  await state.diagnosticsCache.waitForIdle(uri, { maxWaitTime: 5000, idleTime: 300 });
  const afterWait = state.diagnosticsCache.get(uri);
  if (afterWait !== undefined) return afterWait;

  // Trigger diagnostics with a no-op change
  try {
    const content = readFileSync(filePath, 'utf-8');
    state.documentManager.sendChange(filePath, `${content} `);
    state.documentManager.sendChange(filePath, content);
    await state.diagnosticsCache.waitForIdle(uri, { maxWaitTime: 3000, idleTime: 300 });
    return state.diagnosticsCache.get(uri) ?? [];
  } catch {
    return [];
  }
}

// ─── Symbols ──────────────────────────────────────────────────────────────────

export async function getDocumentSymbols(
  state: ServerState,
  filePath: string
): Promise<DocumentSymbol[] | SymbolInformation[]> {
  await ensureAndWait(state, filePath);
  const method = 'textDocument/documentSymbol';
  const result = await state.transport.sendRequest(
    method,
    { textDocument: { uri: pathToUri(filePath) } },
    timeout(state, method)
  );
  if (Array.isArray(result)) return result as DocumentSymbol[] | SymbolInformation[];
  return [];
}

export async function getWorkspaceSymbols(
  state: ServerState,
  query: string
): Promise<SymbolInformation[]> {
  await state.initializationPromise;
  const method = 'workspace/symbol';
  const result = await state.transport.sendRequest(method, { query }, timeout(state, method));
  if (Array.isArray(result)) return result as SymbolInformation[];
  return [];
}

// ─── Refactoring ──────────────────────────────────────────────────────────────

export async function renameSymbol(
  state: ServerState,
  filePath: string,
  position: Position,
  newName: string
): Promise<Record<string, Array<{ range: { start: Position; end: Position }; newText: string }>>> {
  await ensureAndWait(state, filePath);
  const method = 'textDocument/rename';
  const result = await state.transport.sendRequest(
    method,
    { textDocument: { uri: pathToUri(filePath) }, position, newName },
    timeout(state, method)
  );

  return normalizeWorkspaceEdit(result);
}

export async function getCodeActions(
  state: ServerState,
  filePath: string,
  range: { start: Position; end: Position }
): Promise<unknown[]> {
  await ensureAndWait(state, filePath);
  const result = await state.transport.sendRequest(
    'textDocument/codeAction',
    {
      textDocument: { uri: pathToUri(filePath) },
      range,
      context: { diagnostics: [] },
    },
    30000
  );
  if (Array.isArray(result)) return result;
  return [];
}

// ─── Hierarchy ────────────────────────────────────────────────────────────────

export async function prepareCallHierarchy(
  state: ServerState,
  filePath: string,
  position: Position
): Promise<CallHierarchyItem[]> {
  await ensureAndWait(state, filePath);
  const result = await state.transport.sendRequest(
    'textDocument/prepareCallHierarchy',
    { textDocument: { uri: pathToUri(filePath) }, position },
    30000
  );
  if (Array.isArray(result)) return result as CallHierarchyItem[];
  return [];
}

export async function incomingCalls(
  state: ServerState,
  item: CallHierarchyItem
): Promise<CallHierarchyIncomingCall[]> {
  await state.initializationPromise;
  const result = await state.transport.sendRequest('callHierarchy/incomingCalls', { item }, 30000);
  if (Array.isArray(result)) return result as CallHierarchyIncomingCall[];
  return [];
}

export async function outgoingCalls(
  state: ServerState,
  item: CallHierarchyItem
): Promise<CallHierarchyOutgoingCall[]> {
  await state.initializationPromise;
  const result = await state.transport.sendRequest('callHierarchy/outgoingCalls', { item }, 30000);
  if (Array.isArray(result)) return result as CallHierarchyOutgoingCall[];
  return [];
}

export async function prepareTypeHierarchy(
  state: ServerState,
  filePath: string,
  position: Position
): Promise<TypeHierarchyItem[]> {
  await ensureAndWait(state, filePath);
  const result = await state.transport.sendRequest(
    'textDocument/prepareTypeHierarchy',
    { textDocument: { uri: pathToUri(filePath) }, position },
    30000
  );
  if (Array.isArray(result)) return result as TypeHierarchyItem[];
  return [];
}

export async function typeHierarchySubtypes(
  state: ServerState,
  item: TypeHierarchyItem
): Promise<TypeHierarchyItem[]> {
  await state.initializationPromise;
  const result = await state.transport.sendRequest('typeHierarchy/subtypes', { item }, 30000);
  if (Array.isArray(result)) return result as TypeHierarchyItem[];
  return [];
}

export async function typeHierarchySupertypes(
  state: ServerState,
  item: TypeHierarchyItem
): Promise<TypeHierarchyItem[]> {
  await state.initializationPromise;
  const result = await state.transport.sendRequest('typeHierarchy/supertypes', { item }, 30000);
  if (Array.isArray(result)) return result as TypeHierarchyItem[];
  return [];
}

// ─── Intelligence ─────────────────────────────────────────────────────────────

export async function getSignatureHelp(
  state: ServerState,
  filePath: string,
  position: Position
): Promise<unknown> {
  await ensureAndWait(state, filePath);
  return state.transport.sendRequest(
    'textDocument/signatureHelp',
    { textDocument: { uri: pathToUri(filePath) }, position },
    30000
  );
}

export async function getInlayHints(
  state: ServerState,
  filePath: string,
  range: { start: Position; end: Position }
): Promise<unknown[]> {
  await ensureAndWait(state, filePath);
  const result = await state.transport.sendRequest(
    'textDocument/inlayHint',
    { textDocument: { uri: pathToUri(filePath) }, range },
    30000
  );
  if (Array.isArray(result)) return result;
  return [];
}

export async function getCompletions(
  state: ServerState,
  filePath: string,
  position: Position,
  triggerChar?: string
): Promise<unknown[]> {
  await ensureAndWait(state, filePath);
  const context = triggerChar
    ? { triggerKind: 2, triggerCharacter: triggerChar }
    : { triggerKind: 1 };

  const result = await state.transport.sendRequest(
    'textDocument/completion',
    { textDocument: { uri: pathToUri(filePath) }, position, context },
    30000
  );

  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object' && 'items' in result) {
    return (result as { items: unknown[] }).items;
  }
  return [];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeLocations(result: unknown): Location[] {
  if (Array.isArray(result)) {
    return result.map((loc: Location) => ({ uri: loc.uri, range: loc.range }));
  }
  if (result && typeof result === 'object' && 'uri' in result) {
    const loc = result as Location;
    return [{ uri: loc.uri, range: loc.range }];
  }
  return [];
}

function normalizeWorkspaceEdit(
  result: unknown
): Record<string, Array<{ range: { start: Position; end: Position }; newText: string }>> {
  if (!result || typeof result !== 'object') return {};

  const r = result as Record<string, unknown>;

  if ('changes' in r && typeof r['changes'] === 'object' && r['changes'] !== null) {
    return r['changes'] as Record<string, Array<{ range: { start: Position; end: Position }; newText: string }>>;
  }

  if ('documentChanges' in r && Array.isArray(r['documentChanges'])) {
    const changes: Record<string, Array<{ range: { start: Position; end: Position }; newText: string }>> = {};
    for (const change of r['documentChanges'] as Array<{
      textDocument: { uri: string };
      edits: Array<{ range: { start: Position; end: Position }; newText: string }>;
    }>) {
      if (change.textDocument?.uri && change.edits) {
        const uri = change.textDocument.uri;
        changes[uri] = [...(changes[uri] ?? []), ...change.edits];
      }
    }
    return changes;
  }

  return {};
}

export { uriToPath };

export function formatLocation(loc: Location): string {
  const filePath = uriToPath(loc.uri);
  const line = loc.range.start.line + 1;
  const col = loc.range.start.character + 1;
  return `${filePath}:${line}:${col}`;
}

export function formatLocations(locs: Location[]): string {
  if (locs.length === 0) return 'No results found.';
  return locs.map(formatLocation).join('\n');
}

export function symbolKindLabel(kind: number): string {
  const labels: Record<number, string> = {
    1: 'file', 2: 'module', 3: 'namespace', 4: 'package', 5: 'class',
    6: 'method', 7: 'property', 8: 'field', 9: 'constructor', 10: 'enum',
    11: 'interface', 12: 'function', 13: 'variable', 14: 'constant',
    15: 'string', 16: 'number', 17: 'boolean', 18: 'array', 19: 'object',
    20: 'key', 21: 'null', 22: 'enum_member', 23: 'struct', 24: 'event',
    25: 'operator', 26: 'type_parameter',
  };
  return labels[kind] ?? 'unknown';
}

export function severityLabel(severity?: number): string {
  switch (severity) {
    case 1: return 'error';
    case 2: return 'warning';
    case 3: return 'info';
    case 4: return 'hint';
    default: return 'unknown';
  }
}

logger.debug('operations module loaded\n');
