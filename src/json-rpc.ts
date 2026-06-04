import type { ChildProcess } from 'node:child_process';
import { logger } from './logger.js';
import type { LSPMessage } from './types.js';

export type MessageHandler = (message: LSPMessage) => void;

export class JsonRpcTransport {
  private nextId = 1;
  private pendingRequests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }
  >();
  private buffer = '';

  constructor(
    private readonly process: ChildProcess,
    private readonly onMessage: MessageHandler
  ) {
    this.setupStdoutHandler();
  }

  private setupStdoutHandler(): void {
    this.process.stdout?.on('data', (data: Buffer) => {
      this.buffer += data.toString();

      while (this.buffer.includes('\r\n\r\n')) {
        const headerEnd = this.buffer.indexOf('\r\n\r\n');
        const headerPart = this.buffer.substring(0, headerEnd);
        const match = headerPart.match(/Content-Length: (\d+)/);

        if (match?.[1]) {
          const contentLength = parseInt(match[1], 10);
          const msgStart = headerEnd + 4;

          if (this.buffer.length >= msgStart + contentLength) {
            const raw = this.buffer.substring(msgStart, msgStart + contentLength);
            this.buffer = this.buffer.substring(msgStart + contentLength);
            try {
              const message = JSON.parse(raw) as LSPMessage;
              this.handleIncoming(message);
            } catch (err) {
              logger.error(`Failed to parse LSP message: ${err}\n`);
            }
          } else {
            break;
          }
        } else {
          this.buffer = this.buffer.substring(headerEnd + 4);
        }
      }
    });
  }

  private handleIncoming(message: LSPMessage): void {
    if (message.id !== undefined && this.pendingRequests.has(message.id)) {
      const pending = this.pendingRequests.get(message.id)!;
      this.pendingRequests.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message ?? 'LSP Error'));
      } else {
        pending.resolve(message.result);
      }
    }
    if (message.method) {
      this.onMessage(message);
    }
  }

  sendMessage(message: LSPMessage): void {
    const content = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
    this.process.stdin?.write(header + content);
  }

  sendRequest(method: string, params: unknown, timeout = 30000): Promise<unknown> {
    const id = this.nextId++;
    const message: LSPMessage = { jsonrpc: '2.0', id, method, params };

    return new Promise((resolve, reject) => {
      const tid = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`LSP request timeout: ${method} (${timeout}ms)`));
      }, timeout);

      this.pendingRequests.set(id, {
        resolve: (v) => { clearTimeout(tid); resolve(v); },
        reject: (r) => { clearTimeout(tid); reject(r); },
      });

      this.sendMessage(message);
    });
  }

  sendNotification(method: string, params: unknown): void {
    this.sendMessage({ jsonrpc: '2.0', method, params });
  }

  rejectAllPending(reason: string): void {
    const pending = [...this.pendingRequests.values()];
    this.pendingRequests.clear();
    for (const { reject } of pending) {
      reject(new Error(reason));
    }
  }
}
