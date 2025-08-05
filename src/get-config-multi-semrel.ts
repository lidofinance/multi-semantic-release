import { cosmiconfig } from 'cosmiconfig';
import { castArray } from 'lodash-es';

import { mergeConfig } from './utils/merge-config.js';

/**
 * Gets the multi semantic release configuration options for a given directory.
 *
 * @param cwd - The directory to search.
 * @param cliOptions - CLI supplied options.
 * @returns The found configuration option.
 * @internal
 */
export async function getConfigMultiSemantic(
  cwd: string,
  cliOptions: Record<string, unknown>,
) {
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

  const { config } =
    (await cosmiconfig(CONFIG_NAME, { searchPlaces: CONFIG_FILES }).search(
      cwd,
    )) || {};

  let { extends: extendPaths, ...options } = { ...config };

  if (extendPaths) {
    // If `extends` is defined, load and merge each shareable config
    const extendedOptions = await castArray(extendPaths).reduce(
      async (resultPromise, extendPath) => {
        const result = await resultPromise;
        const resolvedPath = await import('import-meta-resolve').then(
          ({ resolve }) => resolve(extendPath, import.meta.url),
        );
        const extendsOptions =
          (await import(resolvedPath)).default ?? (await import(resolvedPath));
        return mergeConfig(result, extendsOptions);
      },
      Promise.resolve({}),
    );

    options = mergeConfig(options, await extendedOptions);
  }

  // Set default options values if not defined yet
  options = mergeConfig(
    {
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
    },
    options,
  );

  // Finally merge CLI options last so they always win
  return mergeConfig(options, cliOptions);
}
