import { logger } from './logger.js';

type PositionFn<T> = (line: number, character: number) => Promise<T | null>;

function isEmpty(result: unknown): boolean {
  if (result === null || result === undefined) return true;
  if (Array.isArray(result) && result.length === 0) return true;
  return false;
}

/**
 * Retry an LSP position-based operation at ±radius offsets when the exact
 * position returns empty. LLMs frequently give off-by-one line/character
 * positions; this makes navigation tools robust to those errors.
 */
export async function tryPositions<T>(
  fn: PositionFn<T>,
  line: number,
  character: number,
  radius = 1
): Promise<T | null> {
  const offsets: [number, number][] = [[0, 0]];
  for (let dl = -radius; dl <= radius; dl++) {
    for (let dc = -radius; dc <= radius; dc++) {
      if (dl !== 0 || dc !== 0) offsets.push([dl, dc]);
    }
  }

  for (const [dl, dc] of offsets) {
    const l = Math.max(0, line + dl);
    const c = Math.max(0, character + dc);

    try {
      const result = await fn(l, c);
      if (!isEmpty(result)) {
        if (dl !== 0 || dc !== 0) {
          logger.debug(`tryPositions: found result at offset (${dl},${dc})\n`);
        }
        return result;
      }
    } catch (err) {
      // Ignore errors for non-exact positions; only throw if the exact position fails
      if (dl === 0 && dc === 0) throw err;
    }
  }

  return null;
}
