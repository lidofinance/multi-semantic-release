import { relative } from 'node:path';
import { env } from 'node:process';
import type { Readable } from 'node:stream';

import { execa } from 'execa';
import gitLogParser from 'git-log-parser';

import { logger } from './utils/logging/logger.js';
import { cleanPath } from './utils/clean-path.js';
import { streamToArray } from './utils/stream-to-array.js';

interface GitCommit {
  committerDate: Date;
  gitTags: string;
  hash: string;
  message: string;
  [key: string]: unknown;
}

/**
 * Retrieve the list of commits on the current branch since the commit sha associated with the last release, or all the commits of the current branch if there is no last released version.
 * Commits are filtered to only return those that correspond to the package directory.
 *
 * This is achieved by using "-- my/dir/path" with `git log` — passing this into gitLogParser().
 *
 * @param cwd - Absolute path of the working directory the Git repo is in.
 * @param direction - Path to the target directory to filter by. Either absolute, or relative to cwd param.
 * @param lastRelease - The SHA of the previous release (defaults to start of all commits if undefined).
 * @param nextRelease - The SHA of the next release (defaults to HEAD if undefined).
 * @param firstParentBranch - First-parent to determine which merges went into master.
 * @returns The list of commits on the branch since the last release.
 */
export async function getCommitsFiltered(
  cwd: string,
  direction: string,
  lastRelease?: string,
  nextRelease?: string,
  firstParentBranch?: string,
): Promise<GitCommit[]> {
  cwd = cleanPath(cwd);
  direction = cleanPath(direction, cwd);

  // target must be inside and different than cwd.
  if (direction.indexOf(cwd) !== 0) {
    throw new Error('dir: Must be inside cwd: ' + direction);
  }

  if (direction === cwd) {
    throw new Error('dir: Must not be equal to cwd: ' + direction);
  }

  // Get top-level Git directory as it might be higher up the tree than cwd.
  const root = await execa('git', ['rev-parse', '--show-toplevel'], { cwd });

  // Add correct fields to gitLogParser.
  Object.assign(gitLogParser.fields, {
    committerDate: { key: 'ci', type: Date },
    gitTags: 'd',
    hash: 'H',
    message: 'B',
  });

  // Use git-log-parser to get the commits.
  const relpath = relative(root.stdout, direction);
  const firstParentBranchFilter = firstParentBranch
    ? ['--first-parent', firstParentBranch]
    : [];
  const range =
    (lastRelease ? `${lastRelease}..` : '') + (nextRelease || 'HEAD');
  const gitLogFilterQuery = [...firstParentBranchFilter, range, '--', relpath];
  const stream = gitLogParser.parse(
    { _: gitLogFilterQuery },
    { cwd, env },
  ) as Readable;

  const commits = await streamToArray<GitCommit>(stream);

  // Trim message and tags.
  commits.forEach((commit) => {
    commit.message = commit.message?.trim() || '';
    commit.gitTags = commit.gitTags?.trim() || '';
  });

  logger.debug('git log filter query: %o', gitLogFilterQuery);
  logger.debug('filtered commits: %O', commits);

  return commits;
}
