import { writeFileSync } from 'node:fs';

import { isEqual, isObject, transform } from 'lodash-es';
import semver from 'semver';

import { getHighestVersion, getLatestVersion } from './utils/get-version.js';
import { recognizeFormat } from './utils/recognize-format.js';
import type { Manifest, Package } from './types.js';
import { logger } from './utils/logging/logger.js';

/**
 * Resolve the next prerelease version comparing bumped tag versions with last version.
 * @param latestTag Last released tag from branch or null if non-existent
 * @param lastVersion Last version released
 * @param packagePreRelease Prerelease identifier from the package to be released
 * @returns Next prerelease version or undefined
 * @internal
 */
const _nextPreHighestVersion = (
  latestTag: string | null | undefined,
  lastVersion: string,
  packagePreRelease: string,
): string | undefined => {
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
 * Resolve next prerelease with special cases (highest version from tags or major/minor/patch).
 * @param tags Tags to include in comparison (if any)
 * @param lastVersionForCurrentMultiRelease Last version released in this multi-release cycle
 * @param packageNextType Next release type evaluated for the package
 * @param packagePreRelease Package prerelease identifier
 * @returns Next prerelease version or undefined
 * @internal
 */
const _nextPreVersionCases = (
  tags: string[],
  lastVersionForCurrentMultiRelease: string,
  packageNextType: import('semver').ReleaseType,
  packagePreRelease: string,
): string | undefined => {
  // Bump from the highest known version: the branch-scoped last release OR any
  // existing tag. Tags may include a stable release cut on another branch that
  // this branch hasn't merged (e.g. `main` ahead of `develop`) — without this
  // the prerelease would regress below a published stable version.
  const latestTag = getLatestVersion(tags, true);
  const base = getHighestVersion(lastVersionForCurrentMultiRelease, latestTag)!;

  // Case 1: base is a stable release → start a fresh prerelease of the bumped
  // version. Guaranteed above every tag: any prerelease of a higher target
  // would itself be the highest tag and take Case 2 instead.
  if (!semver.prerelease(base)) {
    const { major, minor, patch } = semver.parse(base)!;

    return `${semver.inc(
      `${major}.${minor}.${patch}`,
      packageNextType,
    )}-${packagePreRelease}.1`;
  }

  // Case 2: base is already a prerelease → increment it, flooring above the
  // highest tag to avoid collisions.
  return _nextPreHighestVersion(latestTag, base, packagePreRelease);
};

/**
 * Determine dependent release type by scanning and updating local dependencies.
 * @param package_ The package with local dependencies to check
 * @param bumpStrategy Dependency resolution strategy: override, satisfy, inherit
 * @param releaseStrategy Release type when deps are updated: patch, minor, major, inherit
 * @param ignore Packages to ignore (prevents infinite loops)
 * @param prefix Dependency version prefix if bumpStrategy is 'override' ("^" | "~" | "")
 * @returns Highest release type if found; otherwise undefined
 * @internal
 */
const getDependentRelease = (
  package_: Package,
  bumpStrategy: string,
  releaseStrategy: string,
  ignore: Package[],
  prefix: string,
): string | undefined => {
  const severityOrder = ['patch', 'minor', 'major'];
  const { localDeps, manifest } = package_;
  if (!manifest) return undefined;
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
    nextVersion: string | undefined,
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
    ?.filter((p: Package) => !ignore.includes(p))
    .reduce((releaseType: string | undefined, p: Package) => {
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
      //    A dependency-driven release is required only when a dependency
      //    version actually changed in one of the manifest scopes. (A package's
      //    own first release is decided earlier from its commit history via
      //    `_nextType`, so we must not force one here just because it has never
      //    been released — that bumped every package with a local dep on a first
      //    run regardless of whether anything changed.)
      const requireRelease = scopes.reduce(
        (result: boolean, scope: Record<string, string>) =>
          bumpDependency(scope, p.name, nextVersion) || result,
        false,
      );

      // Keep the highest release type across deps. When nothing has been
      // accumulated yet, treat the baseline as below 'patch' (-1) so a
      // patch-level cascade still propagates — otherwise `patch > patch` is
      // false and multi-level cascades stop after the first level.
      const currentRank = releaseType ? severityOrder.indexOf(releaseType) : -1;

      return requireRelease &&
        nextType &&
        severityOrder.indexOf(nextType) > currentRank
        ? nextType
        : releaseType;
    }, undefined);
};

/**
 * Substitute the Yarn/PNPM workspace protocol in a version string for comparison.
 * See: Yarn and PNPM workspace publishing docs.
 * @param currentVersion Current version, may start with "workspace:"
 * @param nextVersion Next version value
 * @returns Current version without the "workspace:" protocol
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
  object: Record<string, unknown>,
  base: Record<string, unknown>,
): Record<string, unknown> =>
  transform(
    object,
    (result: Record<string, unknown>, value: unknown, key: string) => {
      if (!isEqual(value, base[key])) {
        result[key] =
          isObject(value) && isObject(base[key])
            ? difference(
                value as Record<string, unknown>,
                base[key] as Record<string, unknown>,
              )
            : `${String(base[key])} → ${String(value)}`;
      }
    },
  );

/**
 * Compute and log dependency differences between the current and previous manifest.
 * @param actualManifest Current manifest
 * @param path Path to package.json
 * @returns True if dependency sections changed; false otherwise
 * @internal
 */
const auditManifestChanges = (
  actualManifest: Manifest,
  path: string,
): boolean => {
  const debugPrefix = `[${actualManifest.name}]`;
  // Diff against the manifest as it was originally read from disk (captured in
  // the non-enumerable `__contents__`) rather than re-reading the file.
  const oldManifest = (
    actualManifest.__contents__ ? JSON.parse(actualManifest.__contents__) : {}
  ) as Manifest;
  const depScopes = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ];
  const changes = depScopes.reduce(
    (result: Record<string, unknown>, scope: string) => {
      const actualRecord = actualManifest as unknown as Record<string, unknown>;
      const oldRecord = oldManifest as unknown as Record<string, unknown>;
      const actual = actualRecord[scope] as Record<string, unknown> | undefined;
      const old = oldRecord[scope] as Record<string, unknown> | undefined;
      const diff = difference(actual || {}, old || {});

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
 * Resolve the next stable package version based on the last release and next type.
 * @param package_ Package object
 * @returns Next version or undefined if not applicable
 * @internal
 */
export const getNextVersion = (package_: Package): string | undefined => {
  const lastVersion = package_._lastRelease && package_._lastRelease.version;

  return lastVersion && typeof package_._nextType === 'string'
    ? semver.inc(
        lastVersion,
        package_._nextType as import('semver').ReleaseType,
      ) || undefined
    : lastVersion || '1.0.0';
};

/**
 * Extract the prerelease identifier from a semver version string.
 * @param version Semver version string
 * @returns Prerelease identifier or null
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
 * Resolve the next prerelease package version.
 * Evaluates last release for the package and prerelease rules.
 * @param package_ Package object
 * @returns Next prerelease version or undefined
 * @internal
 */
export const getNextPreVersion = (package_: Package): string | undefined => {
  // Note: this is only set is a current multi-semantic-release released
  const lastVersionForCurrentRelease =
    package_._lastRelease && package_._lastRelease.version;

  const lastPreReleaseTag = lastVersionForCurrentRelease
    ? getPreReleaseTag(lastVersionForCurrentRelease)
    : null;
  const isNewPreReleaseTag =
    lastPreReleaseTag && lastPreReleaseTag !== package_._preRelease;

  const tags = package_._tags ?? [];

  // Fresh prerelease line (branch hasn't released yet, or the prerelease
  // identifier changed): still floor above any known tag — e.g. a stable
  // release cut on `main` that this branch hasn't merged — instead of resetting
  // to 1.0.0 and regressing below it. Only fall back to 1.0.0-<pre>.1 when there
  // is genuinely no tag to floor against.
  if (isNewPreReleaseTag || !lastVersionForCurrentRelease) {
    if (!getLatestVersion(tags, true)) {
      return `1.0.0-${package_._preRelease}.1`;
    }

    return _nextPreVersionCases(
      tags,
      lastVersionForCurrentRelease || '',
      (package_._nextType ?? 'patch') as import('semver').ReleaseType,
      package_._preRelease ?? '',
    );
  }

  return _nextPreVersionCases(
    tags,
    lastVersionForCurrentRelease,
    (package_._nextType ?? 'patch') as import('semver').ReleaseType,
    package_._preRelease ?? '',
  );
};

/**
 * Resolve the release type considering cascading dependency updates.
 * @param package_ Package object
 * @param bumpStrategy Dependency resolution strategy: override, satisfy, inherit
 * @param releaseStrategy Release type when deps are updated: patch, minor, major, inherit
 * @param ignore Packages to ignore (prevents infinite loops)
 * @param prefix Dependency version prefix if bumpStrategy is 'override'
 * @returns Resolved release type or undefined
 * @internal
 */
export const resolveReleaseType = (
  package_: Package,
  bumpStrategy: string = 'override',
  releaseStrategy: string = 'patch',
  ignore: Package[] = [],
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
 * Resolve next dependency version according to a chosen bump strategy.
 * @param currentVersion Current declared dependency version/range
 * @param nextVersion Next package version to align to
 * @param bumpStrategy Resolution strategy: inherit, override, satisfy
 * @param prefix Dependency version prefix if bumpStrategy is 'override'
 * @returns Next dependency version string
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
 * Update package.json dependency versions for a package about to be released.
 * Ensures prerelease consistency and writes back the manifest when changed.
 * @param package_ The package this function is being called on
 * @internal
 */
export const updateManifestDeps = (package_: Package): void => {
  const { manifest, path } = package_;
  if (!manifest || !manifest.__contents__) {
    return;
  }
  const { indent, trailingWhitespace } = recognizeFormat(manifest.__contents__);

  // We need to bump pkg.version for correct yarn.lock update
  // https://github.com/qiwi/multi-semantic-release/issues/58
  if (package_._nextRelease?.version) {
    manifest.version = package_._nextRelease.version;
  }

  // Loop through localDeps to verify release consistency.
  package_.localDeps?.forEach((d: Package) => {
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
