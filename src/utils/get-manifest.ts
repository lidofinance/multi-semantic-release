import { existsSync, lstatSync, readFileSync } from 'node:fs';
import type { Manifest } from '../types.js';

/**
 * Read the content of target package.json if exists.
 * @param path file path
 * @returns file content
 * @internal
 */
function readManifest(path: string): string {
  // Check it exists.
  if (!existsSync(path)) {
    throw new ReferenceError(`package.json file not found: "${path}"`);
  }

  // Stat the file.
  let stat;

  try {
    stat = lstatSync(path);
  } catch {
    throw new ReferenceError(`package.json cannot be read: "${path}"`);
  }

  // Check it's a file!
  if (!stat.isFile()) {
    throw new ReferenceError(`package.json is not a file: "${path}"`);
  }

  // Read the file.
  try {
    return readFileSync(path, 'utf8');
  } catch {
    throw new ReferenceError(`package.json cannot be read: "${path}"`);
  }
}

/**
 * Get the parsed contents of a package.json manifest file.
 * Performs structural validation and attaches the raw file contents
 * to a non-enumerable `__contents__` property for formatting purposes.
 *
 * @param path Absolute path to package.json
 * @returns Validated Manifest object
 * @throws ReferenceError if the file does not exist or is unreadable
 * @throws SyntaxError if the file cannot be parsed or is structurally invalid
 */
export default function getManifest(path: string): Manifest {
  // Read the file.
  const contents = readManifest(path);

  // Parse the file.
  let parsed: unknown;

  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new SyntaxError(`package.json could not be parsed: "${path}"`);
  }

  // Must be an object.
  if (typeof parsed !== 'object' || parsed === null) {
    throw new SyntaxError(`package.json was not an object: "${path}"`);
  }

  const manifestObj = parsed as Record<string, unknown>;

  // Must have a name
  const name = manifestObj['name'];
  if (typeof name !== 'string' || name.length === 0) {
    throw new SyntaxError(`Package name must be non-empty string: "${path}"`);
  }

  // Check dependencies
  const checkDeps = (scope: string): void => {
    const value = manifestObj[scope];
    if (
      Object.prototype.hasOwnProperty.call(manifestObj, scope) &&
      typeof value !== 'object'
    ) {
      throw new SyntaxError(`Package ${scope} must be object: "${path}"`);
    }
  };

  checkDeps('dependencies');
  checkDeps('devDependencies');
  checkDeps('peerDependencies');
  checkDeps('optionalDependencies');

  // NOTE non-enumerable prop is skipped by JSON.stringify
  Object.defineProperty(manifestObj, '__contents__', {
    enumerable: false,
    value: contents,
  });

  return manifestObj as unknown as Manifest;
}
