import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';

import { getPackageTags } from './get-package-tags.js';

// Real-git integration: create tags for several packages (matching and not),
// then assert getPackageTags extracts only the target package's valid versions
// regardless of branch reachability.
let repo: string;

const git = (...args: string[]): Promise<unknown> =>
  execa('git', args, { cwd: repo });

beforeAll(async () => {
  repo = realpathSync(mkdtempSync(join(tmpdir(), 'msr-tags-')));
  await git('init');
  await git('config', 'user.email', 'test@example.com');
  await git('config', 'user.name', 'Test');
  await git('config', 'commit.gpgsign', 'false');
  writeFileSync(join(repo, 'file.txt'), 'x');
  await git('add', '.');
  await git('commit', '-m', 'init');

  for (const tag of [
    'a@1.0.0',
    'a@1.1.0',
    'a@2.0.0-alpha.1',
    'a@8.1.1',
    '@scope/b@1.0.0', // different package, must not match `a@*`
    'ab@1.0.0', // shares prefix letters, must not match `a@*`
    'a@not-semver', // matches glob but not a valid version
    'v1.0.0', // unrelated
  ]) {
    await git('tag', tag);
  }
}, 30000);

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('getPackageTags (integration)', () => {
  it('returns only the target package versions, including cross-branch/stable', async () => {
    const versions = await getPackageTags('a@${version}', repo);
    expect(new Set(versions)).toEqual(
      new Set(['1.0.0', '1.1.0', '2.0.0-alpha.1', '8.1.1']),
    );
  });

  it('does not match a different scoped package or a shared-prefix name', async () => {
    const versions = await getPackageTags('a@${version}', repo);
    expect(versions).not.toContain('not-semver');
    // `ab@1.0.0` and `@scope/b@1.0.0` are excluded by the exact prefix check.
    expect(versions.filter((v) => v === '1.0.0')).toHaveLength(1);
  });

  it('extracts versions for a scoped package tag format', async () => {
    const versions = await getPackageTags('@scope/b@${version}', repo);
    expect(versions).toEqual(['1.0.0']);
  });

  it('returns [] when the tagFormat has no ${version} placeholder', async () => {
    expect(await getPackageTags('static-tag', repo)).toEqual([]);
  });

  it('returns [] gracefully when git is unavailable (not a repo)', async () => {
    expect(
      await getPackageTags('a@${version}', '/nonexistent-path-xyz'),
    ).toEqual([]);
  });
});
