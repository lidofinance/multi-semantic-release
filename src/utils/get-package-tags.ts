import { execa } from 'execa';
import { valid } from 'semver';

import { logger } from './logging/logger.js';

/**
 * List every git tag for a package and return their valid semver versions.
 *
 * Unlike semantic-release's branch-scoped lookup, this reads *all* tags
 * (`git tag -l`), so a stable release cut on another branch (e.g. `main` ahead
 * of an unmerged `develop`) stays visible and prereleases can't regress below
 * it. Derives the tag prefix/suffix from the package's `${version}` tagFormat.
 * @param tagFormat Package's resolved tag format, e.g. `my-pkg@${version}`.
 * @param cwd Repository working directory.
 * @returns Valid semver versions found across all tags (unordered).
 * @internal
 */
export async function getPackageTags(
  tagFormat: string,
  cwd: string,
): Promise<string[]> {
  const placeholder = '${version}';
  const idx = tagFormat.indexOf(placeholder);
  if (idx === -1) {
    return [];
  }
  const prefix = tagFormat.slice(0, idx);
  const suffix = tagFormat.slice(idx + placeholder.length);

  try {
    const { stdout } = await execa(
      'git',
      ['tag', '-l', `${prefix}*${suffix}`],
      { cwd },
    );

    return stdout
      .split('\n')
      .map((tag) => tag.trim())
      .filter((tag) => tag.startsWith(prefix) && tag.endsWith(suffix))
      .map((tag) => tag.slice(prefix.length, tag.length - suffix.length))
      .map((version) => valid(version))
      .filter((version): version is string => version !== null);
  } catch (error) {
    logger.debug('getPackageTags failed for %s: %O', tagFormat, error);
    return [];
  }
}
