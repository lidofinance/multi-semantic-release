import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Package } from '../types.js';
import {
  renderReleaseSummary,
  writeGithubSummary,
} from './write-github-summary.js';

const pkg = (overrides: Partial<Package>): Package =>
  ({ name: 'a', ...overrides }) as Package;

const released = pkg({
  name: '@scope/a',
  result: {},
  _lastRelease: { version: '1.0.0' },
  _nextRelease: { version: '1.1.0' },
  _nextType: 'minor',
});
const skipped = pkg({ name: '@scope/b', result: false });

describe('renderReleaseSummary', () => {
  it('lists only packages with a next release', () => {
    const md = renderReleaseSummary([released, skipped], true);

    expect(md).toContain('## Packages to be released');
    expect(md).toContain('| @scope/a | 1.0.0 | **1.1.0** | minor | stable |');
    expect(md).not.toContain('@scope/b');
  });

  it('shows the prerelease channel and a dash for a first release', () => {
    const md = renderReleaseSummary(
      [
        pkg({
          name: 'c',
          result: {},
          _preRelease: 'alpha',
          _nextRelease: { version: '1.0.0-alpha.1' },
          _nextType: 'patch',
        }),
      ],
      true,
    );

    expect(md).toContain('| c | — | **1.0.0-alpha.1** | patch | alpha |');
  });

  it('reports when nothing is released', () => {
    expect(renderReleaseSummary([skipped], true)).toContain(
      'Nothing to release.',
    );
  });

  it('uses a different heading for a real run', () => {
    expect(renderReleaseSummary([released], false)).toContain(
      '## Released packages',
    );
  });
});

describe('writeGithubSummary', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'msr-summary-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('appends to GITHUB_STEP_SUMMARY', async () => {
    const file = join(dir, 'summary.md');

    const written = await writeGithubSummary([released], true, {
      GITHUB_STEP_SUMMARY: file,
    });

    expect(written).toBe(true);
    expect(await readFile(file, 'utf8')).toContain('**1.1.0**');
  });

  it('does nothing when GITHUB_STEP_SUMMARY is not set', async () => {
    expect(await writeGithubSummary([released], true, {})).toBe(false);
  });
});
