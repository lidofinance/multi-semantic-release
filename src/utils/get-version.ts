/**
 * Lifted and tweaked from semantic-release because we follow how they bump their packages/dependencies.
 * https://github.com/semantic-release/semantic-release/blob/master/lib/utils.js
 */

import { gt, prerelease, rcompare } from 'semver';

/**
 * HOC that applies highest/lowest semver function.
 * @param predicate High order function to be called.
 * @param version1 Version 1 to be compared with.
 * @param version2 Version 2 to be compared with.
 * @returns Highest or lowest version.
 * @internal
 */
const _selectVersionBy = (
  predicate: (a: string, b: string) => boolean,
  version1?: string,
  version2?: string,
): string | undefined => {
  if (predicate && version1 && version2) {
    return predicate(version1, version2) ? version1 : version2;
  }

  return version1 || version2;
};

/**
 * Gets highest semver function binding gt to the HOC selectVersionBy.
 * @returns Highest version string or undefined.
 */
export const getHighestVersion: (
  version1?: string,
  version2?: string,
) => string | undefined = _selectVersionBy.bind(null, gt);

/**
 * Retrieve the latest version from a list of versions.
 * @param versions Versions as string list.
 * @param withPrerelease Prerelease flag.
 * @returns Latest version.
 * @internal
 */
export function getLatestVersion(
  versions: string[],
  withPrerelease?: boolean,
): string | undefined {
  return versions
    .filter((version) => withPrerelease || !prerelease(version))
    .sort(rcompare)[0];
}
