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
  logger: { info() {}, debug() {}, warn() {}, error() {} },
}));

import { topo } from '@semrel-extra/topo';
import { multiSemanticRelease } from './multi-semantic-release.js';
import { getConfigMultiSemantic } from './get-config-multi-semrel.js';
import { getPackage } from './get-package.js';
import { releasePackage } from './release-package.js';
import type { Package } from './types.js';

const setup = (sequentialInit = false): void => {
  vi.mocked(getConfigMultiSemantic).mockResolvedValue({
    ignorePrivate: true,
    ignorePackages: [],
    sequentialInit,
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
});
