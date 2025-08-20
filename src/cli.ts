#!/usr/bin/env node

import { exit } from 'node:process';
import { inspect } from 'node:util';

import { Command } from 'commander';
import chalk from 'chalk';

import multisemrelPackageJson from '../package.json' with { type: 'json' };
import semrelPkgJson from 'semantic-release/package.json' with { type: 'json' };

import { multiSemanticRelease } from './multi-semantic-release.js';
import { LOGS_APPNAME } from './constants.js';
import { logger, consoleLog } from './utils/logging/index.js';
import type { ReleaseOptions } from './types.js';

/**
 * CLI entrypoint: runs multi‑semantic‑release with provided options.
 * Manages logging levels and modes (debug/dry‑run/silent).
 * @param options Release options
 */
export function executeRelease(options: ReleaseOptions = {}): void {
  consoleLog(`🚀 Starting ${LOGS_APPNAME}...`, 'LOG');

  if (options.dryRun) {
    consoleLog('📋 Running in dry-run mode', 'Warning');
  }

  // if (options.verbose) {
  //   console.log(chalk.gray('🔍 Verbose mode enabled'));
  // }

  if (options.silent) {
    consoleLog('🔕 Silent mode enabled', 'Info');
    logger.silent = true;
  }

  if (options.debug) {
    consoleLog('🔧 Debug mode enabled', 'Info');
    logger.level = 'debug';
  }

  logger.info(
    chalk.dim(
      `${multisemrelPackageJson.name} version: ${multisemrelPackageJson.version}`,
    ),
  );
  logger.info(
    chalk.dim(`${semrelPkgJson.name} version: ${semrelPkgJson.version}`),
  );

  multiSemanticRelease({ cliOptions: options }).then(
    () => {
      consoleLog('✅ Release completed successfully!', 'Success');
      exit(0);
    },
    (error) => {
      const message =
        error instanceof Error
          ? error.stack || error.message
          : inspect(error, { depth: 5 });
      consoleLog(`[multi-semantic-release]: ${message}`, 'Error');
      exit(1);
    },
  );
}

const program = new Command();

program
  .name('multi-semantic-release')
  .description('Lido Multi-Semantic Release')
  .option('-d, --dry-run', 'Run in dry-run mode')
  .option('-s, --silent', 'Do not print configuration information')
  .option('--debug', 'Output debugging information')
  .option(
    '--sequential-init',
    'Avoid hypothetical concurrent initialization collisions',
  )
  .option(
    '--sequential-prepare',
    'Avoid hypothetical concurrent preparation collisions. Do not use if your project have cyclic dependencies',
  )
  .option('--first-parent', 'Apply commit filtering to current branch only')
  .option(
    '--deps.bump <rule>',
    'Define deps version updating rule. Allowed: override, satisfy, inherit',
  )
  .option(
    '--deps.release <type>',
    'Define release type for dependent package if any of its deps changes. Supported values: patch, minor, major, inherit',
  )
  .option(
    '--deps.prefix <prefix>',
    "Optional prefix to be attached to the next dep version if '--deps.bump' set to 'override'. Supported values: '^' | '~' | '' (empty string as default)",
  )
  .option(
    '--deps.pullTagsForPrerelease [boolean]',
    'Optional flag to control using release tags for evaluating prerelease version bumping (true as default)',
    true,
  )
  .option(
    '--ignore-packages <packages...>',
    'Packages list to be ignored on bumping process',
  )
  .option(
    '--ignore-private',
    "Exclude private packages. Enabled by default, pass 'no-ignore-private' to disable",
    true,
  )
  .option(
    '--tag-format <format>',
    'Format to use for creating tag names. Should include "name" and "version" vars. Default: "${name}@${version}" generates "package-name@1.0.0"',
    '${name}@${version}',
  )
  .action((options: ReleaseOptions) => {
    executeRelease(options);
  });

// Error handling
program.exitOverride();

try {
  program.parse();
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  consoleLog(`❌ Error: ${message}`, 'Error');
  exit(1);
}
