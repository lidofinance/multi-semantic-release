// @ts-expect-error Could not find a declaration file for module
import { getTagHead } from 'semantic-release/lib/git.js';
import { template } from 'lodash-es';

import { getCommitsFiltered } from './get-commits-filtered.js';
import { getPackageTags } from './utils/get-package-tags.js';
import { logger } from './utils/logging/logger.js';
import {
  getNextPreVersion,
  getNextVersion,
  resolveReleaseType,
  updateManifestDeps,
} from './update-deps.js';
import type {
  MultiContext,
  Package,
  SemanticReleaseContext,
  OptionsConfig,
  SemanticReleasePlugins,
  InlineSemanticReleasePlugin,
} from './types.js';

/**
 * Get an inline plugin creator for a multirelease.
 * This is caused once per multirelease and returns a function which should be called once per package within the release.
 * @param multiContext - The multi-semantic-release context.
 * @param options CLI/config options that affect behavior
 * @returns A function that creates an inline package.
 * @internal
 */
export const getInlinePluginCreator = (
  multiContext: MultiContext,
  options: OptionsConfig,
): ((pkg: Package) => InlineSemanticReleasePlugin) => {
  const { cwd } = multiContext;

  /**
   * Create an inline plugin for an individual package in a multirelease.
   * This is called once per package and returns the inline plugin used for semanticRelease()
   * @param pkg - The package this function is being called on.
   * @returns A semantic-release inline plugin containing plugin step functions.
   * @internal
   */
  function createInlinePlugin(pkg: Package): InlineSemanticReleasePlugin {
    const { dir, name, plugins } = pkg as Package & {
      plugins: SemanticReleasePlugins;
    };
    const debugPrefix = `[${name}]`;

    /**
     * @param pluginOptions - Options to configure this plugin.
     * @param context - The semantic-release context.
     * @returns void
     * @internal
     */
    const verifyConditions = async (
      _pluginOptions: unknown,
      context: SemanticReleaseContext,
    ): Promise<unknown> => {
      // Restore context for plugins that does not rely on parsed opts.
      if (context.options._pkgOptions) {
        Object.assign(context.options, context.options._pkgOptions);
      }

      // And bind the actual logger.
      if (pkg.fakeLogger) {
        Object.assign(pkg.fakeLogger, context.logger);
      }

      const result = await plugins.verifyConditions(context);

      pkg._ready = true;

      logger.debug(debugPrefix, 'verified conditions');

      return result;
    };

    /**
     * Analyze commits step.
     * Responsible for determining the type of the next release (major, minor or patch). If multiple plugins with a analyzeCommits step are defined, the release type will be the highest one among plugins output.
     *
     * In multirelease: Returns "patch" if the package contains references to other local packages that have changed, or null if this package references no local packages or they have not changed.
     * Also updates the `context.commits` setting with one returned from `getCommitsFiltered()` (which is filtered by package directory).
     * @param pluginOptions - Options to configure this plugin.
     * @param context - The semantic-release context.
     * @returns Promise that resolves when done.
     * @internal
     */
    const analyzeCommits = async (
      _pluginOptions: unknown,
      context: SemanticReleaseContext,
    ): Promise<string | null> => {
      pkg._preRelease = context.branch.prerelease || null;
      pkg._branch = context.branch.name;

      // Capture this package's already-released versions (from branch tags) so
      // prerelease bumping can pick the next version above any existing tag and
      // avoid collisions. Gated by `deps.pullTagsForPrerelease` (default on).
      if (options.deps?.pullTagsForPrerelease !== false) {
        const branchTags = (context.branch.tags ?? [])
          .map((t) => t.version)
          .filter((v): v is string => Boolean(v));
        // Also pull tags from all branches (not just those reachable from the
        // current branch) so a prerelease can't regress below a stable release
        // cut elsewhere, e.g. `main` ahead of an unmerged `develop`.
        const allTags = await getPackageTags(
          (context.options.tagFormat as string) || '',
          cwd,
        );
        pkg._tags = [...new Set([...branchTags, ...allTags])];
      }

      // Filter commits by directory.
      const firstParentBranch = options.firstParent
        ? context.branch.name
        : undefined;

      // Set context.commits so analyzeCommits does correct analysis.

      context.commits = await getCommitsFiltered(
        cwd,
        dir,
        context.lastRelease?.gitHead,
        context.nextRelease?.gitHead,
        firstParentBranch,
      );

      // Set lastRelease for package from context.
      pkg._lastRelease = context.lastRelease;

      // Set nextType for package from plugins.
      pkg._nextType = (await plugins.analyzeCommits(context)) || undefined;

      pkg._analyzed = true;

      // Make sure type is "patch" if the package has any deps that have been changed.
      if (options.deps) {
        pkg._nextType = resolveReleaseType(
          pkg,
          options.deps.bump,
          options.deps.release,
          [],
          options.deps.prefix,
        );
      }

      logger.debug(debugPrefix, 'commits analyzed');
      logger.debug(debugPrefix, `release type: ${pkg._nextType}`);

      return pkg._nextType || null;
    };

    /**
     * Generate notes step (after).
     * Responsible for generating the content of the release note. If multiple plugins with a generateNotes step are defined, the release notes will be the result of the concatenation of each plugin output.
     *
     * In multirelease: Edit the H2 to insert the package name and add an upgrades section to the note.
     * We want this at the _end_ of the release note which is why it's stored in steps-after.
     *
     * Should look like:
     *
     * ## my-amazing-package [9.2.1](github.com/etc) 2018-12-01
     *
     * ### Features
     *
     * etc
     *
     * ### Dependencies
     *
     * **my-amazing-plugin:** upgraded to 1.2.3
     * **my-other-plugin:** upgraded to 4.9.6
     * @param pluginOptions - Options to configure this plugin.
     * @param context - The semantic-release context.
     * @returns Promise that resolves to the string
     * @internal
     */
    const generateNotes = async (
      _pluginOptions: unknown,
      context: SemanticReleaseContext,
    ): Promise<string> => {
      // Floor this package's own next version above ALL known tags. semantic-
      // release computes the version from a branch-scoped last release, so on a
      // prerelease branch that lags a stable release cut elsewhere (e.g. `main`
      // ahead of `develop`) it can regress below that stable — and diverge from
      // the version dependents pin (which already uses the floored value via
      // `getNextPreVersion`). Recompute here (first wrapped hook with a
      // populated `context.nextRelease`, still before the tag is created) so the
      // published tag and dependent pins agree. Guarded by `_nextType`, and a
      // no-op on the stable channel where the two computations already match.
      if (context.nextRelease && pkg._nextType) {
        const corrected = pkg._preRelease
          ? getNextPreVersion(pkg)
          : getNextVersion(pkg);

        if (corrected && corrected !== context.nextRelease.version) {
          const tagFormat = (context.options.tagFormat as string) || '';
          logger.debug(
            debugPrefix,
            `version floored from ${context.nextRelease.version} to ${corrected}`,
          );
          context.nextRelease.version = corrected;
          if (tagFormat) {
            context.nextRelease.gitTag = template(tagFormat)({
              version: corrected,
            });
            context.nextRelease.name = context.nextRelease.gitTag;
          }
        }
      }

      // Set nextRelease for package.
      pkg._nextRelease = context.nextRelease;

      // Wait until all todo packages are ready to generate notes.
      // await waitForAll("_nextRelease", (p) => p._nextType);

      // Vars.
      const notes: string[] = [];

      // get SHA of lastRelease if not already there (should have been done by Semantic Release...)
      if (
        context.lastRelease?.gitTag &&
        (!context.lastRelease.gitHead ||
          context.lastRelease.gitHead === context.lastRelease.gitTag)
      ) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          context.lastRelease.gitHead = (await getTagHead(
            context.lastRelease.gitTag,
            {
              cwd: context.cwd,
              env: context.env,
            },
          )) as string;
        } catch {
          // Ignore getTagHead errors
        }
      }

      // Filter commits by directory (and release range)
      const firstParentBranch = options.firstParent
        ? context.branch.name
        : undefined;

      // Set context.commits so generateNotes does correct analysis.

      context.commits = await getCommitsFiltered(
        cwd,
        dir,
        context.lastRelease?.gitHead,
        context.nextRelease?.gitHead,
        firstParentBranch,
      );

      // Get subnotes and add to list.
      // Inject pkg name into title if it matches e.g. `# 1.0.0` or `## [1.0.1]` (as generate-release-notes does).
      const subs = await plugins.generateNotes(context);

      // istanbul ignore else (unnecessary to __tests__)
      if (subs) {
        notes.push(
          subs.replace(/^(#+) (\[?\d+\.\d+\.\d+\]?)/u, `$1 ${name} $2`),
        );
      }

      // If it has upgrades add an upgrades section.
      const upgrades = pkg.localDeps?.filter((d: Package) => d._nextRelease);

      if (upgrades && upgrades.length > 0) {
        notes.push(`### Dependencies`);

        const bullets = upgrades.map(
          (d: Package) =>
            `* **${d.name}:** upgraded to ${d._nextRelease?.version}`,
        );

        notes.push(bullets.join('\n'));
      }

      logger.debug(debugPrefix, 'notes generated');

      // Return the notes.
      return notes.join('\n\n');
    };

    const prepare = async (
      _pluginOptions: unknown,
      context: SemanticReleaseContext,
    ): Promise<unknown> => {
      updateManifestDeps(pkg);

      pkg._depsUpdated = true;

      // Filter commits by directory.
      const firstParentBranch = options.firstParent
        ? context.branch.name
        : undefined;

      // Set context.commits so analyzeCommits does correct analysis.

      context.commits = await getCommitsFiltered(
        cwd,
        dir,
        context.lastRelease?.gitHead,
        context.nextRelease?.gitHead,
        firstParentBranch,
      );

      const result = await plugins.prepare(context);

      pkg._prepared = true;

      logger.debug(debugPrefix, 'prepared');

      return result;
    };

    const publish = async (
      _pluginOptions: unknown,
      context: SemanticReleaseContext,
    ): Promise<Record<string, unknown>> => {
      const result = await plugins.publish(context);

      pkg._published = true;

      logger.debug(debugPrefix, 'published');

      return result.length > 0 ? result[0] || {} : {};
    };

    const success = async (
      _pluginOptions: unknown,
      context: SemanticReleaseContext,
    ): Promise<void> => {
      if (
        typeof (
          plugins as unknown as {
            success: (context: SemanticReleaseContext) => Promise<void>;
          }
        )?.success === 'function'
      ) {
        await plugins.success(context);
      }

      logger.debug(debugPrefix, 'success');
    };

    const fail = async (
      _pluginOptions: unknown,
      context: SemanticReleaseContext,
    ): Promise<void> => {
      if (
        typeof (
          plugins as unknown as {
            fail: (context: SemanticReleaseContext) => Promise<void>;
          }
        )?.fail === 'function'
      ) {
        await plugins.fail(context);
      }

      logger.debug(debugPrefix, 'fail');
    };

    const inlinePlugin = {
      analyzeCommits,
      generateNotes,
      prepare,
      publish,
      success,
      fail,
      verifyConditions,
    };

    // Add labels for logs.
    Object.keys(inlinePlugin).forEach((type) => {
      const plugin = inlinePlugin[type as keyof typeof inlinePlugin];
      if (typeof plugin === 'function') {
        Reflect.defineProperty(plugin, 'pluginName', {
          enumerable: true,
          value: `Inline plugin [${pkg.name}]`,
          writable: false,
        });
      }
    });

    logger.debug(debugPrefix, 'inlinePlugin created');

    return inlinePlugin;
  }

  // Return creator function.
  return createInlinePlugin;
};
