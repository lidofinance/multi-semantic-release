import { writeFileSync } from 'node:fs';

import { isEqual, isObject, transform } from 'lodash-es';
import semver from 'semver';

import getManifest from './utils/get-manifest.js';
import { getHighestVersion, getLatestVersion } from './utils/get-version.js';
import { recognizeFormat } from './utils/recognize-format.js';
import type { Manifest } from './types.js';
import { logger } from './logger.js';

/**
 * Resolve next prerelease comparing bumped tags versions with last version.
 * @param latestTag - Last released tag from branch or null if non-existent.
 * @param lastVersion - Last version released.
 * @param packagePreRelease - Prerelease tag from package to-be-released.
 * @returns Next pkg version.
 * @internal
 */
const _nextPreHighestVersion = (
  latestTag: string | null | undefined,
  lastVersion: string,
  packagePreRelease: string,
) => {
  const bumpFromTags = latestTag
    ? semver.inc(latestTag, 'prerelease', packagePreRelease)
    : undefined;
  const bumpFromLast =
    semver.inc(lastVersion, 'prerelease', packagePreRelease) || undefined;

  return bumpFromTags
    ? getHighestVersion(bumpFromLast, bumpFromTags)
    : bumpFromLast;
};

/**
 * Resolve next prerelease special cases: highest version from tags or major/minor/patch.#
 * @param tags - if non-empty, we will use these tags as part fo the comparison
 * @param lastVersionForCurrentMultiRelease - Last package version released from multi-semantic-release
 * @param packageNextType - Next type evaluated for the next package type.
 * @param packagePreRelease - Package prerelease suffix.
 * @returns Next pkg version.
 * @internal
 */
const _nextPreVersionCases = (
  tags: string[],
  lastVersionForCurrentMultiRelease: string,
  packageNextType: string,
  packagePreRelease: string,
): string | undefined => {
  // Case 1: Normal release on last version and is now converted to a prerelease
  if (!semver.prerelease(lastVersionForCurrentMultiRelease)) {
    const { major, minor, patch } = semver.parse(
      lastVersionForCurrentMultiRelease,
    )!;

    // @ts-expect-error
    return `${semver.inc(`${major}.${minor}.${patch}`, packageNextType || 'patch')}-${packagePreRelease}.1`;
  }

  // Case 2: Validates version with tags
  const latestTag = getLatestVersion(tags, true);

  return _nextPreHighestVersion(
    latestTag,
    lastVersionForCurrentMultiRelease,
    packagePreRelease,
  );
};

/**
 * Get dependent release type by recursive scanning and updating pkg deps.
 * @param package_ - The package with local deps to check.
 * @param bumpStrategy - Dependency resolution strategy: override, satisfy, inherit.
 * @param releaseStrategy - Release type triggered by deps updating: patch, minor, major, inherit.
 * @param ignore - Packages to ignore (to prevent infinite loops).
 * @param prefix - Dependency version prefix to be attached if `bumpStrategy='override'`. ^ | ~ | '' (defaults to empty string)
 * @returns Returns the highest release type if found, undefined otherwise
 * @internal
 */
const getDependentRelease = (
  package_: any,
  bumpStrategy: string,
  releaseStrategy: string,
  ignore: any[],
  prefix: string,
): string | undefined => {
  const severityOrder = ['patch', 'minor', 'major'];
  const { localDeps, manifest = {} } = package_;
  const lastVersion = package_._lastRelease && package_._lastRelease.version;
  const {
    dependencies = {},
    devDependencies = {},
    optionalDependencies = {},
    peerDependencies = {},
  } = manifest;
  const scopes = [
    dependencies,
    devDependencies,
    peerDependencies,
    optionalDependencies,
  ];
  const bumpDependency = (
    scope: Record<string, string>,
    name: string,
    nextVersion: string,
  ): boolean => {
    const currentVersion = scope[name];

    if (!nextVersion || !currentVersion) {
      return false;
    }

    const resolvedVersion = resolveNextVersion(
      currentVersion,
      nextVersion,
      bumpStrategy,
      prefix,
    );

    if (currentVersion !== resolvedVersion) {
      scope[name] = resolvedVersion;

      return true;
    }

    return false;
  };

  return localDeps
    .filter((p: any) => !ignore.includes(p))
    .reduce((releaseType: string | undefined, p: any) => {
      // Has changed if...
      // 1. Any local dep package itself has changed
      // 2. Any local dep package has local deps that have changed.
      const nextType = resolveReleaseType(
        p,
        bumpStrategy,
        releaseStrategy,
        [...ignore, package_],
        prefix,
      );
      const nextVersion = nextType
        ? // Update the nextVersion only if there is a next type to be bumped

          p._preRelease
          ? getNextPreVersion(p)
          : getNextVersion(p)
        : // Set the nextVersion fallback to the last local dependency package last version
          p._lastRelease && p._lastRelease.version;

      // 3. And this change should correspond to the manifest updating rule.
      const requireRelease = scopes.reduce(
        (result: boolean, scope: Record<string, string>) =>
          bumpDependency(scope, p.name, nextVersion) || result,
        !lastVersion,
      );

      return requireRelease &&
        // @ts-expect-error nextType can be undefined
        severityOrder.indexOf(nextType) >
          // @ts-expect-error releaseType can be undefined
          severityOrder.indexOf(releaseType)
        ? nextType
        : releaseType;
    }, undefined);
};

/**
 * Substitute "workspace:" in currentVersion
 * See:
 * {@link https://yarnpkg.com/features/workspaces#publishing-workspaces}
 * {@link https://pnpm.io/workspaces#publishing-workspace-packages}
 * @param currentVersion - Current version, may start with "workspace:"
 * @param nextVersion - Next version
 * @returns current version without "workspace:"
 */
const substituteWorkspaceVersion = (
  currentVersion: string,
  nextVersion: string,
): string => {
  if (currentVersion.startsWith('workspace:')) {
    const [, range, caret] = /^workspace:(([\^~*])?.*)$/u.exec(currentVersion)!;

    return caret === range
      ? caret === '*'
        ? nextVersion
        : caret + nextVersion
      : range || '';
  }

  return currentVersion;
};

// https://gist.github.com/Yimiprod/7ee176597fef230d1451
const difference = (
  object: Record<string, any>,
  base: Record<string, any>,
): Record<string, any> =>
  transform(object, (result: Record<string, any>, value: any, key: string) => {
    if (!isEqual(value, base[key])) {
      result[key] =
        isObject(value) && isObject(base[key])
          ? difference(value, base[key])
          : `${base[key]} → ${value}`;
    }
  });

/**
 * Clarify what exactly was changed in manifest file.
 * @param actualManifest - manifest object
 * @param path - manifest path
 * @returns has changed or not
 * @internal
 */
const auditManifestChanges = (
  actualManifest: Manifest,
  path: string,
): boolean => {
  const debugPrefix = `[${actualManifest.name}]`;
  const oldManifest = getManifest(path);
  const depScopes = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ];
  const changes = depScopes.reduce(
    (result: Record<string, any>, scope: string) => {
      // @ts-expect-error Element implicitly has an 'any' type because expression of type 'string' can't be used to index type 'Manifest'.
      const diff = difference(actualManifest[scope], oldManifest[scope]);

      if (Object.keys(diff).length > 0) {
        result[scope] = diff;
      }

      return result;
    },
    {},
  );

  logger.debug(debugPrefix, 'package.json path=', path);

  if (Object.keys(changes).length > 0) {
    logger.debug(debugPrefix, 'changes=', changes);

    return true;
  }

  logger.debug(debugPrefix, 'no deps changes');

  return false;
};

/**
 * Resolve next package version.
 * @param package_ - Package object.
 * @returns Next pkg version.
 * @internal
 */
export const getNextVersion = (package_: any): string | undefined => {
  const lastVersion = package_._lastRelease && package_._lastRelease.version;

  return lastVersion && typeof package_._nextType === 'string'
    ? semver.inc(lastVersion, package_._nextType) || undefined
    : lastVersion || '1.0.0';
};

/**
 * Parse the prerelease tag from a semver version.
 * @param version - Semver version in a string format.
 * @returns preReleaseTag Version prerelease tag or null.
 * @internal
 */
export const getPreReleaseTag = (version: string): string | null => {
  const parsed = semver.parse(version);

  if (!parsed) {
    return null;
  }

  return (parsed.prerelease[0] as string) || null;
};

/**
 * Resolve next package version on prereleases.
 *
 * Will resolve highest next version of either:
 *
 * 1. The last release for the package during this multi-release cycle
 * 2. (if tag options provided):
 * a. the highest increment of the tags array provided
 * b. the highest increment of the gitTags for the prerelease
 * @param package_ - Package object.
 * @returns Next pkg version.
 * @internal
 */
export const getNextPreVersion = (package_: any): string | undefined => {
  // Note: this is only set is a current multi-semantic-release released
  const lastVersionForCurrentRelease =
    package_._lastRelease && package_._lastRelease.version;

  const lastPreReleaseTag = getPreReleaseTag(lastVersionForCurrentRelease);
  const isNewPreReleaseTag =
    lastPreReleaseTag && lastPreReleaseTag !== package_._preRelease;

  return isNewPreReleaseTag || !lastVersionForCurrentRelease
    ? `1.0.0-${package_._preRelease}.1`
    : _nextPreVersionCases(
        [],
        lastVersionForCurrentRelease,
        package_._nextType,
        package_._preRelease,
      );
};

/**
 * Resolve package release type taking into account the cascading dependency update.
 * @param package_ - Package object.
 * @param bumpStrategy - Dependency resolution strategy: override, satisfy, inherit.
 * @param releaseStrategy - Release type triggered by deps updating: patch, minor, major, inherit.
 * @param ignore - Packages to ignore (to prevent infinite loops).
 * @param prefix - Dependency version prefix to be attached if `bumpStrategy='override'`. ^ | ~ | '' (defaults to empty string)
 * @returns Resolved release type.
 * @internal
 */
export const resolveReleaseType = (
  package_: any,
  bumpStrategy: string = 'override',
  releaseStrategy: string = 'patch',
  ignore: any[] = [],
  prefix: string = '',
): string | undefined => {
  // NOTE This fn also updates pkg deps, so it must be invoked anyway.
  const dependentReleaseType = getDependentRelease(
    package_,
    bumpStrategy,
    releaseStrategy,
    ignore,
    prefix,
  );

  // Release type found by commitAnalyzer.
  if (package_._nextType) {
    return package_._nextType;
  }

  if (!dependentReleaseType) {
    return undefined;
  }

  // Define release type for dependent package if any of its deps changes.
  // `patch`, `minor`, `major` — strictly declare the release type that occurs when any dependency is updated.
  // `inherit` — applies the "highest" release of updated deps to the package.
  // For example, if any dep has a breaking change, `major` release will be applied to the all dependants up the chain.

  package_._nextType =
    releaseStrategy === 'inherit' ? dependentReleaseType : releaseStrategy;

  return package_._nextType;
};

/**
 * Resolve next version of dependency.
 * @param currentVersion - Current dep version
 * @param nextVersion - Next release type: patch, minor, major
 * @param bumpStrategy - Resolution strategy: inherit, override, satisfy
 * @param prefix - Dependency version prefix to be attached if `bumpStrategy='override'`. ^ | ~ | '' (defaults to empty string)
 * @returns Next dependency version
 * @internal
 */
export const resolveNextVersion = (
  currentVersion: string,
  nextVersion: string,
  bumpStrategy: string = 'override',
  prefix: string = '',
): string => {
  // handle cases of "workspace protocol" defined in yarn and pnpm workspace, whose version starts with "workspace:"
  currentVersion = substituteWorkspaceVersion(currentVersion, nextVersion);

  // if strategy is ignore, return the current version
  if (bumpStrategy === 'ignore') {
    return currentVersion;
  }

  // no change...
  if (currentVersion === nextVersion) {
    return currentVersion;
  }

  // Check the next pkg version against its current references.
  // If it matches (`*` matches to any, `1.1.0` matches `1.1.x`, `1.5.0` matches to `^1.0.0` and so on)
  // release will not be triggered, if not `override` strategy will be applied instead.
  if (
    (bumpStrategy === 'satisfy' || bumpStrategy === 'inherit') &&
    semver.satisfies(nextVersion, currentVersion)
  ) {
    return currentVersion;
  }

  // `inherit` will try to follow the current declaration version/range.
  // `~1.0.0` + `minor` turns into `~1.1.0`, `1.x` + `major` gives `2.x`,
  // but `1.x` + `minor` gives `1.x` so there will be no release, etc.
  if (bumpStrategy === 'inherit') {
    const separator = '.';
    const nextChunks = nextVersion.split(separator);
    const currentChunks = currentVersion.split(separator);
    const resolvedChunks = currentChunks.map((chunk: string, index: number) =>
      nextChunks[index] ? chunk.replace(/\d+/u, nextChunks[index]) : chunk,
    );

    return resolvedChunks.join(separator);
  }

  // "override"
  // By default next package version would be set as is for the all dependants.
  return prefix + nextVersion;
};

/**
 * Update pkg deps.
 * @param package_ - The package this function is being called on.
 * @returns void
 * @internal
 */
export const updateManifestDeps = (package_: any): void => {
  const { manifest, path } = package_;
  const { indent, trailingWhitespace } = recognizeFormat(manifest.__contents__);

  // We need to bump pkg.version for correct yarn.lock update
  // https://github.com/qiwi/multi-semantic-release/issues/58
  manifest.version = package_._nextRelease.version || manifest.version;

  // Loop through localDeps to verify release consistency.
  package_.localDeps.forEach((d: any) => {
    // Get version of dependency.
    const release = d._nextRelease || d._lastRelease;

    // Cannot establish version.
    if (!release || !release.version) {
      throw new Error(
        `Cannot release ${package_.name} because dependency ${d.name} has not been released yet`,
      );
    }
  });

  if (!auditManifestChanges(manifest, path)) {
    return;
  }

  // Write package.json back out.
  writeFileSync(
    path,
    JSON.stringify(manifest, null, indent) + trailingWhitespace,
  );
};
