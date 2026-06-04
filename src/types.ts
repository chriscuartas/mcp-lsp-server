// ─── Config ───────────────────────────────────────────────────────────────────

export interface ServerConfig {
  extensions: string[];
  command: string[];
  rootDir?: string;
  initializationOptions?: unknown;
}

export interface Config {
  servers: ServerConfig[];
  enableRawMode?: boolean;
}

// ─── LSP primitives ───────────────────────────────────────────────────────────

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  uri: string;
  range: Range;
}

// ─── Diagnostics ──────────────────────────────────────────────────────────────

export enum DiagnosticSeverity {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4,
}

export interface Diagnostic {
  range: Range;
  severity?: DiagnosticSeverity;
  code?: number | string;
  source?: string;
  message: string;
  relatedInformation?: Array<{ location: Location; message: string }>;
}

// ─── Symbols ──────────────────────────────────────────────────────────────────

export enum SymbolKind {
  File = 1, Module = 2, Namespace = 3, Package = 4, Class = 5,
  Method = 6, Property = 7, Field = 8, Constructor = 9, Enum = 10,
  Interface = 11, Function = 12, Variable = 13, Constant = 14,
  String = 15, Number = 16, Boolean = 17, Array = 18, Object = 19,
  Key = 20, Null = 21, EnumMember = 22, Struct = 23, Event = 24,
  Operator = 25, TypeParameter = 26,
}

export interface DocumentSymbol {
  name: string;
  detail?: string;
  kind: SymbolKind;
  range: Range;
  selectionRange: Range;
  children?: DocumentSymbol[];
}

export interface SymbolInformation {
  name: string;
  kind: SymbolKind;
  location: Location;
  containerName?: string;
}

// ─── Call/Type hierarchy ──────────────────────────────────────────────────────

export interface CallHierarchyItem {
  name: string;
  kind: SymbolKind;
  detail?: string;
  uri: string;
  range: Range;
  selectionRange: Range;
  data?: unknown;
}

export interface CallHierarchyIncomingCall {
  from: CallHierarchyItem;
  fromRanges: Range[];
}

export interface CallHierarchyOutgoingCall {
  to: CallHierarchyItem;
  fromRanges: Range[];
}

export interface TypeHierarchyItem {
  name: string;
  kind: SymbolKind;
  detail?: string;
  uri: string;
  range: Range;
  selectionRange: Range;
  data?: unknown;
}

// ─── JSON-RPC ─────────────────────────────────────────────────────────────────

export interface LSPMessage {
  jsonrpc: string;
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ─── Server adapter ───────────────────────────────────────────────────────────

export interface InitializeParams {
  processId: number | null;
  clientInfo: { name: string; version: string };
  capabilities: unknown;
  rootUri: string;
  workspaceFolders: Array<{ uri: string; name: string }>;
  initializationOptions?: unknown;
}

export interface ServerAdapter {
  readonly name: string;
  matches(config: ServerConfig): boolean;
  customizeInitializeParams?(params: InitializeParams): InitializeParams;
  handleNotification?(method: string, params: unknown, state: ServerState): boolean;
  handleRequest?(method: string, params: unknown, state: ServerState): Promise<unknown>;
  getTimeout?(method: string): number | undefined;
}

// ─── Server state ─────────────────────────────────────────────────────────────

export interface DiagnosticsCache {
  update(uri: string, items: Diagnostic[], version?: number): void;
  get(uri: string): Diagnostic[] | undefined;
  waitForIdle(uri: string, opts?: { maxWaitTime?: number; idleTime?: number }): Promise<void>;
}

export interface Transport {
  sendRequest(method: string, params: unknown, timeout?: number): Promise<unknown>;
  sendMessage(message: LSPMessage): void;
  sendNotification(method: string, params: unknown): void;
  rejectAllPending(reason: string): void;
}

export interface DocManager {
  ensureOpen(filePath: string): Promise<boolean>;
  sendChange(filePath: string, text: string): void;
  isOpen(filePath: string): boolean;
  getVersion(filePath: string): number;
}

export interface ServerState {
  process: import('node:child_process').ChildProcess;
  transport: Transport;
  documentManager: DocManager;
  diagnosticsCache: DiagnosticsCache;
  initialized: boolean;
  initializationPromise: Promise<void>;
  initializationResolve?: () => void;
  startTime: number;
  config: ServerConfig;
  restartTimer?: ReturnType<typeof setTimeout>;
  adapter?: ServerAdapter;
  capabilities?: unknown;
}
