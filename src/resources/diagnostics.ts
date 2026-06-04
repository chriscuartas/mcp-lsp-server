import { logger } from '../logger.js';

export const diagnosticsResource = {
  template: {
    uriTemplate: 'lsp-diagnostics://{path}',
    name: 'LSP Diagnostics',
    description: 'Real-time LSP diagnostics for a file. Subscribe to get updates when diagnostics change.',
    mimeType: 'text/plain',
  },
};

// Polling state: uri -> interval handle + last known fingerprint
const subscriptions = new Map<string, {
  interval: ReturnType<typeof setInterval>;
  lastFingerprint: string;
}>();

export function subscribeDiagnostics(
  filePath: string,
  onUpdate: (text: string) => void,
  getDiags: () => Promise<string>
): () => void {
  let lastFingerprint = '';

  const interval = setInterval(async () => {
    try {
      const text = await getDiags();
      const fingerprint = text;
      if (fingerprint !== lastFingerprint) {
        lastFingerprint = fingerprint;
        onUpdate(text);
      }
    } catch (err) {
      logger.debug(`Diagnostics poll error for ${filePath}: ${err}\n`);
    }
  }, 500);

  subscriptions.set(filePath, { interval, lastFingerprint });

  return () => {
    const sub = subscriptions.get(filePath);
    if (sub) {
      clearInterval(sub.interval);
      subscriptions.delete(filePath);
    }
  };
}

export function clearAllSubscriptions(): void {
  for (const { interval } of subscriptions.values()) {
    clearInterval(interval);
  }
  subscriptions.clear();
}
