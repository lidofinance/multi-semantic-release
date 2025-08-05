import { castArray, template } from 'lodash-es';
import semanticRelease from 'semantic-release';
import type { MultiContext, Package } from './types.js';
import { RescopedStream } from './utils/rescoped-stream.js';

/**
 * Release an individual package.
 * @param pkg The specific package.
 * @param createInlinePlugin A function that creates an inline plugin.
 * @param multiContext Context object for the multirelease.
 * @param configOptions
 * @returns Promise that resolves when done.
 * @internal
 */
export async function releasePackage(
  pkg: Package,
  createInlinePlugin: (pkg: Package) => any,
  multiContext: MultiContext,
  configOptions: any,
): Promise<any> {
  const { dir, name, options: packageOptions } = pkg;
  const { env, stderr, stdout } = multiContext;

  // Make an 'inline plugin' for this package.
  // The inline plugin is the only plugin we call semanticRelease() with.
  // The inline plugin functions then call e.g. plugins.analyzeCommits() manually and sometimes manipulate the responses.
  const inlinePlugin = createInlinePlugin(pkg);

  // Set the options that we call semanticRelease() with.
  // This consists of:
  // - The global options (e.g. from the top level package.json)
  // - The package options (e.g. from the specific package's package.json)
  const options = { ...packageOptions, ...inlinePlugin };

  // Add the package name into tagFormat.
  // Thought about doing a single release for the tag (merging several packages), but it's impossible to prevent Github releasing while allowing NPM to continue.
  // It'd also be difficult to merge all the assets into one release without full editing/overriding the plugins.
  const tagFormatContext = {
    name,
    version: '${version}',
  };

  const tagFormatDefault = '${name}@${version}';

  options.tagFormat = template(configOptions.tagFormat || tagFormatDefault)(
    tagFormatContext,
  );

  // These are the only two options that MSR shares with semrel
  // Set them manually for now, defaulting to the msr versions
  // - debug is only supported in semrel as a CLI arg, always default to MSR
  options.debug = configOptions.debug;
  // - dryRun should use the msr version if specified, otherwise fallback to semrel
  options.dryRun =
    configOptions.dryRun === undefined ? options.dryRun : configOptions.dryRun;
  options.ci = configOptions.ci === undefined ? options.ci : configOptions.ci;
  options.branches = configOptions.branches
    ? castArray(configOptions.branches)
    : options.branches;

  // This options are needed for plugins that do not rely on `pluginOptions` and extract them independently.
  options._pkgOptions = packageOptions;

  // Call semanticRelease() on the directory and save result to pkg.
  // Don't need to log out errors as semantic-release already does that.
  pkg.result = await semanticRelease(options, {
    cwd: dir,
    env,
    // @ts-expect-error RescopedStream is compatible with Writable
    stderr: new RescopedStream(stderr, name),
    // @ts-expect-error RescopedStream is compatible with Writable
    stdout: new RescopedStream(stdout, name),
  });

  return pkg;
}
