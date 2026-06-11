import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  resolveNextVersion,
  getNextVersion,
  getNextPreVersion,
  getPreReleaseTag,
  resolveReleaseType,
  updateManifestDeps,
} from './update-deps.js';
import getManifest from './utils/get-manifest.js';
import type { Package } from './types.js';

const pkg = (overrides: Partial<Package>): Package =>
  overrides as unknown as Package;

describe('resolveNextVersion', () => {
  it('override (default) replaces the version, honoring a prefix', () => {
    expect(resolveNextVersion('1.0.0', '2.0.0')).toBe('2.0.0');
    expect(resolveNextVersion('1.0.0', '2.0.0', 'override', '^')).toBe(
      '^2.0.0',
    );
  });

  it('returns the current version unchanged when it equals the next', () => {
    expect(resolveNextVersion('1.0.0', '1.0.0')).toBe('1.0.0');
  });

  it('ignore strategy keeps the current range', () => {
    expect(resolveNextVersion('^1.0.0', '2.0.0', 'ignore')).toBe('^1.0.0');
  });

  it('satisfy keeps the range when the next version already satisfies it', () => {
    expect(resolveNextVersion('^1.0.0', '1.5.0', 'satisfy')).toBe('^1.0.0');
  });

  it('satisfy falls back to override when the next version does not satisfy', () => {
    expect(resolveNextVersion('^1.0.0', '2.0.0', 'satisfy')).toBe('2.0.0');
  });

  it('inherit follows the existing range shape', () => {
    expect(resolveNextVersion('~1.0.0', '1.1.0', 'inherit')).toBe('~1.1.0');
  });

  it('resolves the yarn/pnpm workspace:* protocol to the next version', () => {
    expect(resolveNextVersion('workspace:*', '2.0.0')).toBe('2.0.0');
  });
});

describe('getNextVersion', () => {
  it('defaults a never-released package to 1.0.0', () => {
    expect(getNextVersion(pkg({}))).toBe('1.0.0');
  });

  it('increments the last version by the next type', () => {
    expect(
      getNextVersion(
        pkg({ _lastRelease: { version: '1.2.3' }, _nextType: 'minor' }),
      ),
    ).toBe('1.3.0');
  });

  it('keeps the last version when there is no next type', () => {
    expect(getNextVersion(pkg({ _lastRelease: { version: '1.2.3' } }))).toBe(
      '1.2.3',
    );
  });
});

describe('getPreReleaseTag', () => {
  it('extracts the prerelease identifier', () => {
    expect(getPreReleaseTag('1.0.0-alpha.1')).toBe('alpha');
  });

  it('returns null for a stable version', () => {
    expect(getPreReleaseTag('1.0.0')).toBeNull();
  });

  it('returns null for an unparsable version', () => {
    expect(getPreReleaseTag('not-a-version')).toBeNull();
  });
});

describe('getNextPreVersion', () => {
  it('starts a brand-new prerelease at 1.0.0-<tag>.1', () => {
    expect(getNextPreVersion(pkg({ _preRelease: 'alpha' }))).toBe(
      '1.0.0-alpha.1',
    );
  });

  it('increments an existing prerelease of the same tag', () => {
    expect(
      getNextPreVersion(
        pkg({
          _lastRelease: { version: '1.0.0-alpha.1' },
          _preRelease: 'alpha',
          _nextType: 'patch',
        }),
      ),
    ).toBe('1.0.0-alpha.2');
  });

  it('converts a stable release into a prerelease bumped by the next type', () => {
    expect(
      getNextPreVersion(
        pkg({
          _lastRelease: { version: '1.0.0' },
          _preRelease: 'alpha',
          _nextType: 'minor',
        }),
      ),
    ).toBe('1.1.0-alpha.1');
  });

  // Regression (HIGH #5): when prerelease tags exist that are AHEAD of
  // `_lastRelease` (e.g. parallel prerelease lines or re-tagging), the next
  // version must be bumped from the highest tag to avoid collisions — not
  // blindly from `_lastRelease`. Previously tags were ignored (`[]` hardcoded),
  // so this returned 1.0.0-alpha.3 and could clash with the existing alpha.5.
  it('bumps from the highest existing prerelease tag, not just _lastRelease', () => {
    expect(
      getNextPreVersion(
        pkg({
          _lastRelease: { version: '1.0.0-alpha.2' },
          _preRelease: 'alpha',
          _nextType: 'patch',
          _tags: ['1.0.0-alpha.1', '1.0.0-alpha.2', '1.0.0-alpha.5'],
        }),
      ),
    ).toBe('1.0.0-alpha.6');
  });

  it('still bumps from _lastRelease when no higher tag exists', () => {
    expect(
      getNextPreVersion(
        pkg({
          _lastRelease: { version: '1.0.0-alpha.2' },
          _preRelease: 'alpha',
          _nextType: 'patch',
          _tags: ['1.0.0-alpha.1', '1.0.0-alpha.2'],
        }),
      ),
    ).toBe('1.0.0-alpha.3');
  });
});

describe('resolveReleaseType', () => {
  const mk = (overrides: Partial<Package>): Package =>
    ({
      deps: [],
      localDeps: [],
      manifest: { name: overrides.name ?? 'pkg', dependencies: {} },
      ...overrides,
    }) as unknown as Package;

  it('returns the type already found by the commit analyzer', () => {
    expect(resolveReleaseType(mk({ _nextType: 'major' }))).toBe('major');
  });

  it('returns undefined when there are no deps and no own changes', () => {
    expect(resolveReleaseType(mk({}))).toBeUndefined();
  });

  it('bumps to the configured release type when a local dep changed', () => {
    const dep = mk({
      name: 'dep',
      _lastRelease: { version: '1.0.0' },
      _nextType: 'minor',
    });
    const consumer = mk({
      name: 'consumer',
      manifest: { name: 'consumer', dependencies: { dep: '^1.0.0' } },
      localDeps: [dep],
    });

    expect(resolveReleaseType(consumer, 'override', 'patch')).toBe('patch');
    // getDependentRelease also rewrites the in-memory dep range.
    expect(consumer.manifest?.dependencies?.dep).toBe('1.1.0');
  });

  it('inherits the dependency release type when releaseStrategy is "inherit"', () => {
    const dep = mk({
      name: 'dep',
      _lastRelease: { version: '1.0.0' },
      _nextType: 'minor',
    });
    const consumer = mk({
      name: 'consumer',
      manifest: { name: 'consumer', dependencies: { dep: '^1.0.0' } },
      localDeps: [dep],
    });

    expect(resolveReleaseType(consumer, 'override', 'inherit')).toBe('minor');
  });

  // Regression (HIGH): the dependency cascade must propagate across MULTIPLE
  // levels. a -> b -> c: when `a` changes, `b` gets a patch (dep changed), and
  // `c` (depends on `b`) must also get a patch. Previously the severity check
  // compared against a 'patch' floor with strict `>`, so a patch-level cascade
  // stopped at the first level (`patch > patch` is false) and `c` was skipped.
  it('propagates a patch cascade across multiple dependency levels', () => {
    const a = mk({
      name: 'a',
      _lastRelease: { version: '1.0.0' },
      _nextType: 'minor',
    });
    const b = mk({
      name: 'b',
      _lastRelease: { version: '1.0.0' },
      manifest: { name: 'b', dependencies: { a: '^1.0.0' } },
      localDeps: [a],
    });
    const c = mk({
      name: 'c',
      _lastRelease: { version: '1.0.0' },
      manifest: { name: 'c', dependencies: { b: '^1.0.0' } },
      localDeps: [b],
    });

    // c depends on b, which is patch-released because a changed → c must release.
    expect(resolveReleaseType(c, 'override', 'patch')).toBe('patch');
  });

  // Regression (HIGH): a never-released package must NOT be force-released just
  // because it has a local dep — only an actual version change should trigger
  // one. Here the dep is releasing but the consumer already references its next
  // version, so nothing changes and no release is required.
  it('does not force a release for a new package when no dep range changes', () => {
    const dep = mk({
      name: 'dep',
      _lastRelease: { version: '1.0.0' },
      _nextType: 'minor', // -> next version 1.1.0
    });
    const consumer = mk({
      name: 'consumer',
      // already pinned to the dep's next version, no _lastRelease (brand new)
      manifest: { name: 'consumer', dependencies: { dep: '1.1.0' } },
      localDeps: [dep],
    });

    expect(resolveReleaseType(consumer, 'override', 'patch')).toBeUndefined();
  });
});

describe('updateManifestDeps', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'msr-manifest-'));
    path = join(dir, 'package.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const writeManifest = (manifest: object): void => {
    writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
  };

  it('writes bumped dep versions and the next package version back to disk', () => {
    writeManifest({
      name: 'consumer',
      version: '1.0.0',
      dependencies: { dep: '1.0.0' },
    });
    const manifest = getManifest(path);
    // Simulate the bump that getDependentRelease performs in-memory.
    manifest.dependencies!.dep = '2.0.0';

    updateManifestDeps(
      pkg({
        name: 'consumer',
        path,
        manifest,
        localDeps: [pkg({ name: 'dep', _nextRelease: { version: '2.0.0' } })],
        _nextRelease: { version: '1.1.0' },
      }),
    );

    const written = JSON.parse(readFileSync(path, 'utf8')) as {
      version: string;
      dependencies: Record<string, string>;
    };
    expect(written.dependencies.dep).toBe('2.0.0');
    expect(written.version).toBe('1.1.0');
  });

  it('throws when a local dependency has not been released', () => {
    writeManifest({ name: 'consumer', version: '1.0.0', dependencies: {} });
    const manifest = getManifest(path);

    expect(() =>
      updateManifestDeps(
        pkg({
          name: 'consumer',
          path,
          manifest,
          localDeps: [pkg({ name: 'dep' })],
        }),
      ),
    ).toThrow(/has not been released yet/u);
  });
});
