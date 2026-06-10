import { describe, it, expect, vi, beforeEach } from 'vitest';

// Isolate the wrapper from git: every step calls getCommitsFiltered.
vi.mock('./get-commits-filtered.js', () => ({
  getCommitsFiltered: vi.fn().mockResolvedValue([]),
}));
// getTagHead is used by generateNotes to backfill lastRelease.gitHead.
vi.mock('semantic-release/lib/git.js', () => ({
  getTagHead: vi.fn().mockResolvedValue('deadbeefsha'),
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
