import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getConfig } from './get-config.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'msr-get-config-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('getConfig', () => {
  it('loads a .releaserc.json config', async () => {
    writeFileSync(
      join(dir, '.releaserc.json'),
      JSON.stringify({ branches: ['main'] }),
    );
    expect(await getConfig(dir)).toEqual({ branches: ['main'] });
  });

  it('reads the "release" key from package.json', async () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'pkg', release: { branches: ['develop'] } }),
    );
    expect(await getConfig(dir)).toEqual({ branches: ['develop'] });
  });

  it('returns an empty object when no config is found', async () => {
    expect(await getConfig(dir)).toEqual({});
  });
});
