import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
      pullTagsForPrerelease: true,
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
      pullTagsForPrerelease: true,
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

  // Regression: the CLI must not pass commander defaults over the config file.
  describe('config file vs CLI options', () => {
    let configDir: string;

    beforeAll(async () => {
      configDir = await mkdtemp(join(tmpdir(), 'msr-config-file-'));
      await writeFile(
        join(configDir, '.multi-releaserc.json'),
        JSON.stringify({
          tagFormat: 'v${version}-${name}',
          ignorePrivate: false,
          deps: { pullTagsForPrerelease: false },
        }),
      );
    });

    afterAll(async () => {
      await rm(configDir, { recursive: true, force: true });
    });

    it('keeps config file values when CLI options are empty', async () => {
      const options = await getConfigMultiSemantic(configDir, {});
      expect(options.tagFormat).toBe('v${version}-${name}');
      expect(options.ignorePrivate).toBe(false);
      expect(options.deps?.pullTagsForPrerelease).toBe(false);
    });

    it('lets explicit CLI values win over the config file', async () => {
      const options = await getConfigMultiSemantic(configDir, {
        ignorePrivate: true,
        tagFormat: 'x',
      });
      expect(options.tagFormat).toBe('x');
      expect(options.ignorePrivate).toBe(true);
    });
  });

  // Regression: `extends` resolves from the project dir, not msr's own location.
  describe('extends', () => {
    let extDir: string;

    beforeAll(async () => {
      extDir = await mkdtemp(join(tmpdir(), 'msr-config-extends-'));
      await writeFile(
        join(extDir, 'shared.mjs'),
        "export default { tagFormat: 'shared-${version}', ignorePrivate: false };\n",
      );
      await writeFile(
        join(extDir, '.multi-releaserc.json'),
        JSON.stringify({ extends: './shared.mjs', ignorePrivate: true }),
      );
    });

    afterAll(async () => {
      await rm(extDir, { recursive: true, force: true });
    });

    it('resolves a relative extends from the project dir and merges it', async () => {
      const options = await getConfigMultiSemantic(extDir, {});
      expect(options.tagFormat).toBe('shared-${version}');
      // Project's own keys win over extended ones.
      expect(options.ignorePrivate).toBe(true);
    });
  });
});
