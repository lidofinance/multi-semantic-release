import { describe, it, expect, vi, beforeEach } from 'vitest';

// Isolate the wrapper from git: every step calls getCommitsFiltered.
vi.mock('./get-commits-filtered.js', () => ({
  getCommitsFiltered: vi.fn().mockResolvedValue([]),
}));
// getTagHead is used by generateNotes to backfill lastRelease.gitHead.
vi.mock('semantic-release/lib/git.js', () => ({
  getTagHead: vi.fn().mockResolvedValue('deadbeefsha'),
}));
// Avoid shelling out to `git tag`; tests drive pkg._tags directly.
vi.mock('./utils/get-package-tags.js', () => ({
  getPackageTags: vi.fn().mockResolvedValue([]),
}));

import { getInlinePluginCreator } from './get-inline-plugin-creator.js';
import type {
  MultiContext,
  OptionsConfig,
  Package,
  SemanticReleaseContext,
  SemanticReleasePlugins,
} from './types.js';

const noopLogger = { error() {}, log() {}, success() {}, warn() {} };

const makePlugins = (): SemanticReleasePlugins =>
  ({
    verifyConditions: vi.fn().mockResolvedValue('verified'),
    analyzeCommits: vi.fn().mockResolvedValue('minor'),
    generateNotes: vi.fn().mockResolvedValue('## 1.0.0\n\nthe notes'),
    prepare: vi.fn().mockResolvedValue('prepared'),
    publish: vi.fn().mockResolvedValue([{ name: 'npm' }]),
    success: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
  }) as unknown as SemanticReleasePlugins;

const multiContext = {
  cwd: '/repo',
  env: {},
  globalOptions: {},
  stderr: process.stderr,
  stdout: process.stdout,
} as unknown as MultiContext;

const options = {
  deps: { bump: 'override', release: 'patch', prefix: '' },
  firstParent: false,
} as unknown as OptionsConfig;

const makeContext = (
  overrides: Partial<SemanticReleaseContext> = {},
): SemanticReleaseContext =>
  ({
    branch: { name: 'main' },
    commits: [],
    cwd: '/repo',
    env: {},
    lastRelease: {},
    nextRelease: { version: '1.0.0', gitHead: 'abc' },
    logger: noopLogger,
    options: {},
    ...overrides,
  }) as unknown as SemanticReleaseContext;

let plugins: SemanticReleasePlugins;
let pkg: Package;

beforeEach(() => {
  plugins = makePlugins();
  pkg = {
    name: 'a',
    dir: '/repo/packages/a',
    plugins,
    fakeLogger: { ...noopLogger },
    manifest: { name: 'a', dependencies: {} },
    localDeps: [],
  } as unknown as Package;
});

describe('getInlinePluginCreator', () => {
  const create = () => getInlinePluginCreator(multiContext, options)(pkg);

  it('verifyConditions delegates and marks the package ready', async () => {
    const result = await create().verifyConditions({}, makeContext());
    expect(plugins.verifyConditions).toHaveBeenCalled();
    expect(result).toBe('verified');
    expect(pkg._ready).toBe(true);
  });

  it('analyzeCommits records the release type from the plugins', async () => {
    const type = await create().analyzeCommits({}, makeContext());
    expect(plugins.analyzeCommits).toHaveBeenCalled();
    expect(pkg._analyzed).toBe(true);
    expect(type).toBe('minor');
    expect(pkg._nextType).toBe('minor');
  });

  // Wiring for HIGH #5: branch tags are captured so prerelease bumping can use them.
  it('analyzeCommits captures branch tag versions into pkg._tags', async () => {
    const context = makeContext({
      branch: {
        name: 'develop',
        prerelease: 'alpha',
        tags: [
          { version: '1.0.0-alpha.1', gitTag: 'a@1.0.0-alpha.1' },
          { version: '1.0.0-alpha.2', gitTag: 'a@1.0.0-alpha.2' },
        ],
      },
    });
    await create().analyzeCommits({}, context);
    expect(pkg._tags).toEqual(['1.0.0-alpha.1', '1.0.0-alpha.2']);
  });

  it('generateNotes injects the package name into the heading', async () => {
    const notes = await create().generateNotes({}, makeContext());
    expect(plugins.generateNotes).toHaveBeenCalled();
    expect(notes).toContain('## a 1.0.0');
  });

  // Regression (CRITICAL): gitHead must be the awaited value, not a Promise.
  it('generateNotes awaits getTagHead to backfill lastRelease.gitHead', async () => {
    const context = makeContext({
      lastRelease: { gitTag: 'a@0.9.0' },
    });
    await create().generateNotes({}, context);
    expect(context.lastRelease?.gitHead).toBe('deadbeefsha');
  });

  // Regression (diverged branches): semantic-release computes the version from a
  // branch-scoped last release, so on a prerelease branch lagging a stable
  // release cut elsewhere it can regress below stable. generateNotes must floor
  // the package's own version (and gitTag) above all known tags.
  it('generateNotes floors the package version above a higher stable tag', async () => {
    pkg._preRelease = 'alpha';
    pkg._nextType = 'minor';
    pkg._lastRelease = { version: '8.0.0-alpha.5' };
    pkg._tags = ['8.0.0-alpha.5', '8.0.0', '8.1.0', '8.1.1'];
    const context = makeContext({
      nextRelease: { version: '8.0.0-alpha.6', gitHead: 'abc' },
      options: { tagFormat: 'a@${version}' },
    });

    await create().generateNotes({}, context);

    expect(context.nextRelease?.version).toBe('8.2.0-alpha.1');
    expect(context.nextRelease?.gitTag).toBe('a@8.2.0-alpha.1');
    expect(context.nextRelease?.name).toBe('a@8.2.0-alpha.1');
    expect(pkg._nextRelease?.version).toBe('8.2.0-alpha.1');
  });

  it('generateNotes leaves the version untouched when nothing needs flooring', async () => {
    pkg._nextType = 'minor';
    pkg._lastRelease = { version: '1.0.0' };
    const context = makeContext({
      nextRelease: { version: '1.1.0', gitHead: 'abc' },
      options: { tagFormat: 'a@${version}' },
    });

    await create().generateNotes({}, context);

    expect(context.nextRelease?.version).toBe('1.1.0');
    // No override → gitTag is not synthesized here.
    expect(context.nextRelease?.gitTag).toBeUndefined();
  });

  it('generateNotes appends a Dependencies section for upgraded local deps', async () => {
    pkg.localDeps = [
      { name: 'dep', _nextRelease: { version: '2.0.0' } } as unknown as Package,
    ];
    const notes = await create().generateNotes({}, makeContext());
    expect(notes).toContain('### Dependencies');
    expect(notes).toContain('**dep:** upgraded to 2.0.0');
  });

  it('prepare updates deps and delegates to the plugins', async () => {
    const result = await create().prepare({}, makeContext());
    expect(plugins.prepare).toHaveBeenCalled();
    expect(pkg._prepared).toBe(true);
    expect(pkg._depsUpdated).toBe(true);
    expect(result).toBe('prepared');
  });

  it('publish returns the first plugin result', async () => {
    const result = await create().publish({}, makeContext());
    expect(result).toEqual({ name: 'npm' });
    expect(pkg._published).toBe(true);
  });

  it('success and fail forward to the optional plugin hooks', async () => {
    await create().success({}, makeContext());
    await create().fail({}, makeContext());
    expect(plugins.success).toHaveBeenCalled();
    expect(plugins.fail).toHaveBeenCalled();
  });
});
