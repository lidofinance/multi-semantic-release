import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';

import { getCommitsFiltered } from './get-commits-filtered.js';

// Real-git integration: build a tiny monorepo with commits scoped to different
// package directories, then assert directory + range filtering works.
let repo: string;
let firstSha: string;

const git = (...args: string[]): Promise<unknown> =>
  execa('git', args, { cwd: repo });

const commitFile = async (file: string, content: string, message: string) => {
  const abs = join(repo, file);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, content);
  await git('add', '.');
  await git('commit', '-m', message);
};

beforeAll(async () => {
  // realpathSync avoids the macOS /private symlink mismatch with `git rev-parse`.
  repo = realpathSync(mkdtempSync(join(tmpdir(), 'msr-git-')));
  await git('init');
  await git('config', 'user.email', 'test@example.com');
  await git('config', 'user.name', 'Test');
  await git('config', 'commit.gpgsign', 'false');

  await commitFile('packages/a/index.js', 'a1', 'feat: change in a');
  firstSha = (
    (await execa('git', ['rev-parse', 'HEAD'], { cwd: repo })) as {
      stdout: string;
    }
  ).stdout;
  await commitFile('packages/b/index.js', 'b1', 'feat: change in b');
}, 30000);

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('getCommitsFiltered (integration)', () => {
  it('returns only commits touching the given package directory', async () => {
    const commits = await getCommitsFiltered(repo, join(repo, 'packages/a'));
    expect(commits).toHaveLength(1);
    expect(commits[0]?.message).toBe('feat: change in a');
  });

  it('limits commits to the range since lastRelease', async () => {
    // Everything in packages/b after the first (a) commit.
    const commits = await getCommitsFiltered(
      repo,
      join(repo, 'packages/b'),
      firstSha,
    );
    expect(commits).toHaveLength(1);
    expect(commits[0]?.message).toBe('feat: change in b');
  });

  it('returns no commits for a range with no matching changes', async () => {
    const commits = await getCommitsFiltered(
      repo,
      join(repo, 'packages/a'),
      firstSha,
    );
    expect(commits).toHaveLength(0);
  });
});
