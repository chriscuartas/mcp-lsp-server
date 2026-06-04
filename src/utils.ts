import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalize } from 'node:path';

export function pathToUri(filePath: string): string {
  return pathToFileURL(normalize(filePath)).toString();
}

export function uriToPath(uri: string): string {
  return fileURLToPath(uri);
}
