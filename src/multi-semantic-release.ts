import chalk from 'chalk';
import { topo } from '@semrel-extra/topo';
import { sortBy } from 'lodash-es';
import { cwd, env, stderr, stdout } from 'node:process';

import { getConfigMultiSemantic } from './get-config-multi-semrel.js';
import { getConfig } from './get-config.js';
import { getPackage } from './get-package.js';
import { getInlinePluginCreator } from './get-inline-plugin-creator.js';
import type { MultiContext, Package, ReleaseOptions } from './types.js';
import { releasePackage } from './release-package.js';
import { logger } from './utils/logging/logger.js';

/**
 * Runs a multi‑release for all packages in the workspace.
 * Builds the dependency graph, prepares a queue, and releases packages in order.
 * @param cliOptions CLI options that affect the process
 * @returns List of packages with populated result fields
 */
export const multiSemanticRelease = async ({
  cliOptions = {},
}: {
  cliOptions?: ReleaseOptions;
}): Promise<Package[]> => {
  const calledCwd = cwd();

  const options = await getConfigMultiSemantic(calledCwd, cliOptions);

  const globalOptions = await getConfig(calledCwd);
  const multiContext: MultiContext = {
    cwd: calledCwd,
    env,
    globalOptions,
    stderr,
    stdout,
  };
  const topoResult = (await topo({
    cwd: calledCwd,
    filter: ({ manifest }: { manifest: { private?: boolean } }) =>
      !options.ignorePrivate || !manifest.private,
    workspacesExtra: Array.isArray(options.ignorePackages)
      ? options.ignorePackages.map((p: string) => `!${p}`)
      : [],
  })) as {
    packages: Record<string, { manifestPath: string }>;
    queue: string[];
  };

  const { packages: topoPackages, queue } = topoResult;

  const paths = Object.values(topoPackages).map((p) => p.manifestPath);

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
    pkg.localDeps = [
      ...new Set(
        pkg.deps
          .map((d) => packages.find((p) => d === p.name))
          .filter((dep): dep is Package => dep !== undefined),
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
    async (accPromise: Promise<number>, packageName: string) => {
      const acc = await accPromise;
      const package_ = packages.find(({ name }) => name === packageName);

      if (package_) {
        const result = await releasePackage(
          package_,
          createInlinePlugin,
          multiContext,
          options,
        );

        if (result) {
          return acc + 1;
        }
      }

      return acc;
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
};
