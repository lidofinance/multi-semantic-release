import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@semrel-extra/topo', () => ({ topo: vi.fn() }));
vi.mock('./get-config-multi-semrel.js', () => ({
  getConfigMultiSemantic: vi.fn(),
}));
vi.mock('./get-config.js', () => ({
  getConfig: vi.fn().mockResolvedValue({}),
}));
vi.mock('./get-package.js', () => ({ getPackage: vi.fn() }));
vi.mock('./get-inline-plugin-creator.js', () => ({
  getInlinePluginCreator: vi.fn(() => vi.fn()),
}));
vi.mock('./release-package.js', () => ({ releasePackage: vi.fn() }));
vi.mock('./utils/logging/logger.js', () => ({
  logger: { info: vi.fn(), debug() {}, warn: vi.fn(), error() {} },
}));

import { topo } from '@semrel-extra/topo';
import { multiSemanticRelease } from './multi-semantic-release.js';
import { getConfigMultiSemantic } from './get-config-multi-semrel.js';
import { getPackage } from './get-package.js';
import { releasePackage } from './release-package.js';
import { logger } from './utils/logging/logger.js';
import type { Package } from './types.js';

const setup = (
  sequentialInit = false,
  verifyConditions?: string | string[],
  dryRun = false,
): void => {
  vi.mocked(getConfigMultiSemantic).mockResolvedValue({
    ignorePrivate: true,
    ignorePackages: [],
    sequentialInit,
    verifyConditions,
    dryRun,
  });
  vi.mocked(topo).mockResolvedValue({
    packages: {
      a: { manifestPath: '/repo/packages/a/package.json' },
      b: { manifestPath: '/repo/packages/b/package.json' },
    },
    queue: ['a', 'b'],
  } as unknown as Awaited<ReturnType<typeof topo>>);
  vi.mocked(getPackage).mockImplementation((path: string) => {
    const name = path.includes('/a/') ? 'a' : 'b';
    return Promise.resolve({
      name,
      // b depends on a
      deps: name === 'b' ? ['a'] : [],
      manifest: { name },
      path,
    } as unknown as Package);
  });
  vi.mocked(releasePackage).mockResolvedValue(true as unknown as Package);
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('multiSemanticRelease', () => {
  it('loads, links and releases every queued package', async () => {
    setup();
    const result = await multiSemanticRelease({});

    // Returned in topological queue order.
    expect(result.map((p) => p.name)).toEqual(['a', 'b']);
    // One release attempt per queued package.
    expect(releasePackage).toHaveBeenCalledTimes(2);
  });

  it('wires localDeps from the loaded package set', async () => {
    setup();
    const result = await multiSemanticRelease({});
    const b = result.find((p) => p.name === 'b');
    expect(b?.localDeps?.map((d) => d.name)).toEqual(['a']);

    const a = result.find((p) => p.name === 'a');
    expect(a?.localDeps).toEqual([]);
  });

  // Regression (HIGH #4): the sequentialInit option must still load every
  // package (previously the option was accepted but had no implementation).
  it('loads every package when sequentialInit is enabled', async () => {
    setup(true);
    const result = await multiSemanticRelease({});
    expect(getPackage).toHaveBeenCalledTimes(2);
    expect(result.map((p) => p.name)).toEqual(['a', 'b']);
  });

  it.each([
    [['@semantic-release/github'], ['@semantic-release/github']],
    [
      '@semantic-release/github,./local',
      ['@semantic-release/github', './local'],
    ],
    [
      ['a, b', 'c'],
      ['a', 'b', 'c'],
    ],
    [undefined, undefined],
    [[''], undefined],
  ])(
    'passes verifyConditions %j to packages as %j',
    async (input, expected) => {
      setup(false, input);
      await multiSemanticRelease({});
      for (const [, ctx] of vi.mocked(getPackage).mock.calls) {
        expect(ctx.verifyConditions).toEqual(expected);
      }
    },
  );

  describe('verifyConditions warning', () => {
    it('warns when verifyConditions is set without dryRun', async () => {
      setup(false, '@semantic-release/github');
      await multiSemanticRelease({});
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('@semantic-release/github'),
      );
    });

    it('does not warn with dryRun', async () => {
      setup(false, '@semantic-release/github', true);
      await multiSemanticRelease({});
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('does not warn when verifyConditions is unset', async () => {
      setup();
      await multiSemanticRelease({});
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  // Regression: releasePackage always returns the package, so count by `result`.
  it('counts only packages with a truthy result as released', async () => {
    setup();
    vi.mocked(releasePackage).mockImplementation((pkg: Package) => {
      pkg.result = pkg.name === 'a' ? false : ({} as Package['result']);
      return Promise.resolve(pkg);
    });
    await multiSemanticRelease({});
    const messages = vi.mocked(logger.info).mock.calls.map(([m]) => String(m));
    expect(messages.some((m) => m.includes('Released 1 of 2'))).toBe(true);
  });
});
