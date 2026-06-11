import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import getManifest from './get-manifest.js';

let dir: string;
let path: string;

const write = (contents: string): void => {
  path = join(dir, 'package.json');
  writeFileSync(path, contents);
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'msr-get-manifest-'));
  path = join(dir, 'package.json');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('getManifest', () => {
  it('parses a valid manifest and preserves dependency scopes', () => {
    write('{\n  "name": "pkg",\n  "dependencies": { "a": "^1.0.0" }\n}\n');
    const manifest = getManifest(path);
    expect(manifest.name).toBe('pkg');
    expect(manifest.dependencies).toEqual({ a: '^1.0.0' });
  });

  it('attaches the raw contents on a non-enumerable __contents__ property', () => {
    const contents = '{ "name": "pkg" }';
    write(contents);
    const manifest = getManifest(path);
    expect(manifest.__contents__).toBe(contents);
    // Non-enumerable so JSON.stringify round-trips cleanly.
    expect(Object.keys(manifest)).not.toContain('__contents__');
    expect(JSON.parse(JSON.stringify(manifest))).not.toHaveProperty(
      '__contents__',
    );
  });

  it('throws a ReferenceError when the file does not exist', () => {
    expect(() => getManifest(join(dir, 'missing.json'))).toThrow(
      ReferenceError,
    );
  });

  it('throws a SyntaxError for unparsable JSON', () => {
    write('{ not json');
    expect(() => getManifest(path)).toThrow(SyntaxError);
  });

  it('throws when the package name is missing', () => {
    write('{ "version": "1.0.0" }');
    expect(() => getManifest(path)).toThrow(/name must be non-empty/u);
  });

  it('throws when a dependency scope is not an object', () => {
    write('{ "name": "pkg", "dependencies": "nope" }');
    expect(() => getManifest(path)).toThrow(/dependencies must be object/u);
  });
});
