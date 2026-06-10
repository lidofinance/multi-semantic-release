import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getConfigMultiSemantic } from './get-config-multi-semrel.js';

// An empty temp dir => cosmiconfig finds no config, so the result is
// defaults + CLI options only — ideal for asserting CLI normalization.
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'msr-config-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('getConfigMultiSemantic', () => {
  it('applies default deps config when nothing is provided', async () => {
    const options = await getConfigMultiSemantic(dir, {});
    expect(options.deps).toEqual({
      bump: 'override',
      release: 'patch',
      prefix: '',
    });
  });

  // Regression: commander emits `--deps.bump` etc. as flat dot-notation keys.
  // They must be folded into a nested `deps` object, otherwise CLI overrides
  // were silently dropped and consumers always read the defaults.
  it('normalizes flat deps.* CLI keys into a nested deps object', async () => {
    const options = await getConfigMultiSemantic(dir, {
      'deps.bump': 'satisfy',
      'deps.prefix': '~',
    });

    expect(options.deps).toEqual({
      bump: 'satisfy',
      release: 'patch',
      prefix: '~',
    });
    expect('deps.bump' in options).toBe(false);
    expect('deps.prefix' in options).toBe(false);
  });

  it('lets CLI options win over defaults', async () => {
    const options = await getConfigMultiSemantic(dir, {
      silent: true,
      tagFormat: '${name}-v${version}',
    });
    expect(options.silent).toBe(true);
    expect(options.tagFormat).toBe('${name}-v${version}');
  });
});
