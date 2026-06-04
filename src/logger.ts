const debug = process.env.MCP_LSP_DEBUG === '1';

export const logger = {
  debug: (msg: string) => { if (debug) process.stderr.write(`[DEBUG] ${msg}`); },
  info:  (msg: string) => { process.stderr.write(`[INFO]  ${msg}`); },
  warn:  (msg: string) => { process.stderr.write(`[WARN]  ${msg}`); },
  error: (msg: string) => { process.stderr.write(`[ERROR] ${msg}`); },
};
