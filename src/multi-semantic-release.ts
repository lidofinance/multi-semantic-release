import { logger } from './logger.js';
import chalk from 'chalk';
import { topo } from '@semrel-extra/topo';
import { sortBy } from 'lodash-es';

// @ts-expect-error Could not find a declaration file for module
import getConfigSemantic from 'semantic-release/lib/get-config.js';

import { getConfigMultiSemantic } from './get-config-multi-semrel.js';
import { getConfig } from './get-config.js';
import { getPackage } from './get-package.js';
import { getInlinePluginCreator } from './get-inline-plugin-creator.js';
import type { MultiContext } from './types.js';
import { releasePackage } from './release-package.js';

export async function multiSemanticRelease({
  cliOptions = {},
}: {
  cliOptions?: Record<string, any>;
}) {
  const cwd = process.cwd();
  const env = process.env;
  const stderr = process.stderr;
  const stdout = process.stdout;

  const options = await getConfigMultiSemantic(cwd, cliOptions);

  const globalOptions = await getConfig(cwd);
  const multiContext: MultiContext = {
    cwd,
    env,
    globalOptions,
    stderr,
    stdout,
  };
  const { packages: topoPackages, queue } = await topo({
    cwd,
    filter: ({
      manifest,
      manifestAbsPath,
      manifestRelPath,
    }: {
      manifest: any;
      manifestAbsPath: any;
      manifestRelPath: any;
    }) => !options.ignorePrivate || !manifest.private,
    workspacesExtra: Array.isArray(options.ignorePackages)
      ? options.ignorePackages.map((p: string) => `!${p}`)
      : [],
  });

  const paths = Object.values(topoPackages).map((p: any) => p.manifestPath);

  logger.info(
    `Started multi-release — ${chalk.inverse(`Loading ${paths.length} packages...`)}`,
  );
  logger.debug(
    `Running with options: ${chalk.yellow(JSON.stringify(options))}`,
  );

  // Load packages from paths
  const packages = await Promise.all(
    paths.map((path) => getPackage(path, multiContext)),
  );

  packages.forEach((pkg) => {
    // Once we load all the packages we can find their cross refs
    // Make a list of local dependencies.
    // Map dependency names (e.g. my-awesome-dep) to their actual package objects in the packages array.
    // @ts-expect-error Add localDeps property dynamically if not present in type
    pkg.localDeps = [
      ...new Set(
        pkg.deps.map((d) => packages.find((p) => d === p.name)).filter(Boolean),
      ),
    ];

    logger.info(`Loaded package ${pkg.name}`);
  });

  logger.info(
    chalk.inverse(`Queued ${queue.length} packages! Starting release...`),
  );

  // Release all packages.
  const createInlinePlugin = getInlinePluginCreator(
    packages,
    multiContext,
    options,
  );

  const released = await queue.reduce(
    async (_m: Promise<number>, _name: string) => {
      const m = await _m;
      const package_ = packages.find(({ name }) => name === _name);

      if (package_) {
        const { result } = await releasePackage(
          package_,
          createInlinePlugin,
          multiContext,
          options,
        );

        if (result) {
          return m + 1;
        }
      }

      return m;
    },
    Promise.resolve(0),
  );

  // Return packages list
  logger.info(
    chalk.bgGreen(
      `Released ${released} of ${queue.length} packages, semantically!`,
    ),
  );

  return sortBy(packages, ({ name }) => queue.indexOf(name));
}
