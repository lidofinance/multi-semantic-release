import { castArray, template } from 'lodash-es';
import semanticRelease from 'semantic-release';
import type {
  InlineSemanticReleasePlugin,
  MultiContext,
  Package,
} from './types.js';
import { RescopedStream } from './utils/rescoped-stream.js';

/**
 * Releases a single package using an inline plugin.
 * Builds semantic‑release options from global and package‑specific settings.
 * @param pkg Package to release
 * @param createInlinePlugin Factory for the inline plugin for this package
 * @param multiContext Global multi‑release context (cwd/env/stdout/stderr)
 * @param configOptions Additional configuration (e.g., tagFormat)
 * @returns Semantic‑release result also stored in pkg.result
 * @internal
 */
export const releasePackage = async (
  pkg: Package,
  createInlinePlugin: (pkg: Package) => InlineSemanticReleasePlugin,
  multiContext: MultiContext,
  configOptions: Record<string, unknown>,
): Promise<unknown> => {
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
  // - Our inline plugin functions merged directly to avoid plugin loading issues
  const options = { ...packageOptions, ...inlinePlugin };

  // Add the package name into tagFormat.
  // Thought about doing a single release for the tag (merging several packages), but it's impossible to prevent Github releasing while allowing NPM to continue.
  // It'd also be difficult to merge all the assets into one release without full editing/overriding the plugins.
  const tagFormatContext = {
    name,
    version: '${version}',
  };

  const tagFormatDefault = '${name}@${version}';

  options.tagFormat = template(
    (configOptions.tagFormat as string) || tagFormatDefault,
  )(tagFormatContext);

  // These are the only two options that MSR shares with semrel
  // Set them manually for now, defaulting to the msr versions
  // - debug is only supported in semrel as a CLI arg, always default to MSR
  options.debug = configOptions.debug as boolean;
  // - dryRun should use the msr version if specified, otherwise fallback to semrel
  options.dryRun =
    configOptions.dryRun === undefined
      ? options.dryRun
      : (configOptions.dryRun as boolean);
  options.ci =
    configOptions.ci === undefined ? options.ci : (configOptions.ci as boolean);
  options.branches = configOptions.branches
    ? castArray(configOptions.branches as string[])
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
};
