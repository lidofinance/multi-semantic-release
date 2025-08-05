import process from 'node:process';
import { isAbsolute, join, normalize } from 'node:path';

/**
 * Normalize and make a path absolute, optionally using a custom CWD.
 * Trims any trailing slashes from the path.
 * @param path The path to normalize and make absolute.
 * @param cwd The CWD to prepend to the path to make it absolute.
 * @returns The absolute and normalized path.
 * @internal
 */
export function cleanPath(path: string, cwd = process.cwd()): string {
  // Normalize, absolutify, and trim trailing slashes from the path.
  return normalize(isAbsolute(path) ? path : join(cwd, path)).replace(
    /[/\\]+$/u,
    '',
  );
}
