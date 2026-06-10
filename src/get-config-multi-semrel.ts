import { cosmiconfig } from 'cosmiconfig';
import { castArray } from 'lodash-es';

import { mergeConfig } from './utils/merge-config.js';
import type { DependencyConfig, ReleaseOptions } from './types.js';

/**
 * Loads and merges multi‑semantic‑release configuration.
 * Supports extends, defaults and CLI overrides.
 * @param cwd Directory to search in
 * @param cliOptions CLI options that override config
 * @returns Final merged configuration
 */
export const getConfigMultiSemantic = async (
  cwd: string,
  cliOptions: ReleaseOptions,
): Promise<ReleaseOptions> => {
  const CONFIG_NAME = 'multi-release';
  const CONFIG_FILES = [
    'package.json',
    `.${CONFIG_NAME}rc`,
    `.${CONFIG_NAME}rc.json`,
    `.${CONFIG_NAME}rc.yaml`,
    `.${CONFIG_NAME}rc.yml`,
    `.${CONFIG_NAME}rc.js`,
    `.${CONFIG_NAME}rc.cjs`,
    `${CONFIG_NAME}.config.js`,
    `${CONFIG_NAME}.config.cjs`,
  ];

  const searchResult = await cosmiconfig(CONFIG_NAME, {
    searchPlaces: CONFIG_FILES,
  }).search(cwd);
  const config = searchResult?.config as Record<string, unknown> | undefined;

  const { extends: extendPaths, ...configOptions } = (config || {}) as {
    extends?: string | string[];
    [key: string]: unknown;
  };
  let options: Record<string, unknown> = configOptions;

  if (extendPaths) {
    // If `extends` is defined, load and merge each shareable config
    const extendedOptions = await castArray(extendPaths).reduce(
      async (
        resultPromise: Promise<Record<string, unknown>>,
        extendPath: string,
      ) => {
        const result: Record<string, unknown> = await resultPromise;
        const resolvedPath = await import('import-meta-resolve').then(
          ({ resolve }) => resolve(extendPath, import.meta.url),
        );
        const importedModule = (await import(resolvedPath)) as {
          default?: Record<string, unknown>;
          [key: string]: unknown;
        };
        const extendsOptions = importedModule.default ?? importedModule;
        return mergeConfig(result, extendsOptions);
      },
      Promise.resolve({}),
    );

    // The project's own config must win over what it extends from
    // (same semantics as ESLint/tsconfig/semantic-release `extends`).
    options = mergeConfig(extendedOptions, options);
  }

  // Set default options values if not defined yet
  const defaultOptions: Record<string, unknown> = {
    branches: undefined,
    ci: undefined,
    debug: false,
    deps: {
      bump: 'override',
      prefix: '',
      release: 'patch',
    },
    dryRun: undefined,
    firstParent: false,
    ignorePackages: [],
    ignorePrivate: true,
    sequentialInit: false,
    sequentialPrepare: true,
    silent: false,
    tagFormat: '${name}@${version}',
  };

  options = mergeConfig(defaultOptions, options);

  // Commander emits `--deps.bump`/`--deps.release`/`--deps.prefix` as flat,
  // dot-notation keys (e.g. `{ 'deps.bump': 'override' }`) rather than a nested
  // `deps` object. Fold them into `deps` so mergeConfig (and the consumers that
  // read `options.deps.bump`) actually see CLI overrides.
  const normalizedCliOptions: ReleaseOptions = { ...cliOptions };
  const cliDeps: Partial<DependencyConfig> = {};
  if (cliOptions['deps.bump'] != null) cliDeps.bump = cliOptions['deps.bump'];
  if (cliOptions['deps.release'] != null)
    cliDeps.release = cliOptions['deps.release'];
  if (cliOptions['deps.prefix'] != null)
    cliDeps.prefix = cliOptions['deps.prefix'];

  if (Object.keys(cliDeps).length > 0) {
    normalizedCliOptions.deps = {
      ...cliOptions.deps,
      ...cliDeps,
    } as DependencyConfig;
  }
  delete normalizedCliOptions['deps.bump'];
  delete normalizedCliOptions['deps.release'];
  delete normalizedCliOptions['deps.prefix'];

  // Finally merge CLI options last so they always win
  return mergeConfig(options, normalizedCliOptions);
};
