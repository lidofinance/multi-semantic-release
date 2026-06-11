import { dirname } from 'node:path';

// @ts-expect-error Could not find a declaration file for module
import getConfigSemantic from 'semantic-release/lib/get-config.js';

import type {
  Package,
  Manifest,
  MultiContext,
  OptionsConfig,
  SemanticReleasePlugins,
} from './types.js';
import { cleanPath } from './utils/clean-path.js';
import getManifest from './utils/get-manifest.js';
import { getConfig } from './get-config.js';
import type { Logger } from './types.js';

/**
 * Loads details about a package.
 *
 * @param path - The path to load details about.
 * @param allOptions - Options that apply to all packages.
 * @returns A promise that resolves to a Package object.
 * @internal
 */
export async function getPackage(
  path: string,
  { cwd, env, globalOptions, stderr, stdout }: MultiContext,
): Promise<Package> {
  // Make path absolute.
  path = cleanPath(path, cwd);

  const directory = dirname(path);

  // Get package.json file contents.
  const manifest: Manifest = getManifest(path);
  const { name } = manifest;

  // Combine list of all dependency names.
  const deps = Object.keys({
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.peerDependencies,
    ...manifest.optionalDependencies,
  });

  // Load the package-specific options.
  const packageOptions = await getConfig(directory);

  // The 'final options' are the global options merged with package-specific options.
  // We merge this ourselves because package-specific options can override global options.
  const finalOptions = { ...globalOptions, ...packageOptions };

  // Sanitize user-defined plugins to avoid undefined/false entries
  if (Array.isArray(finalOptions.plugins)) {
    finalOptions.plugins = finalOptions.plugins.filter(Boolean);
  }

  // Make a fake logger so semantic-release's get-config doesn't fail.
  const fakeLoggerBase: Logger = {
    error() {},
    log() {},
    success() {},
    warn() {},
  };
  const fakeLogger = {
    ...fakeLoggerBase,
    scopeName: 'semantic-release',
    scope: (): Logger => fakeLoggerBase,
  };

  // Use semantic-release's internal config with the final options (now we have the right `options.plugins` setting) to get the plugins object and the options including defaults.
  // We need this so we can call e.g. plugins.analyzeCommit() to be able to affect the input and output of the whole set of plugins.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const { options, plugins } = (await getConfigSemantic(
    { cwd: directory, env, stderr, stdout, logger: fakeLogger },
    finalOptions,
  )) as { options: OptionsConfig; plugins: SemanticReleasePlugins };

  // Return package object.
  return {
    deps,
    dir: directory,
    fakeLogger,
    manifest,
    name,
    options,
    path,
    plugins,
  };
}
