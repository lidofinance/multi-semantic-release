// @ts-expect-error Could not find a declaration file for module
import { getTagHead } from 'semantic-release/lib/git.js';

import { getCommitsFiltered } from './get-commits-filtered.js';
import { logger } from './logger.js';
import { resolveReleaseType, updateManifestDeps } from './update-deps.js';
import type { MultiContext, Package } from './types.js';

/**
 * Get an inline plugin creator for a multirelease.
 * This is caused once per multirelease and returns a function which should be called once per package within the release.
 * @param packages - The multi-semantic-release context.
 * @param multiContext - The multi-semantic-release context.
 * @param options - argv options
 * @returns A function that creates an inline package.
 * @internal
 */
export function getInlinePluginCreator(
  packages: Package[],
  multiContext: MultiContext,
  options: Record<string, any>,
) {
  const { cwd } = multiContext;

  /**
   * Create an inline plugin for an individual package in a multirelease.
   * This is called once per package and returns the inline plugin used for semanticRelease()
   * @param pkg - The package this function is being called on.
   * @returns A semantic-release inline plugin containing plugin step functions.
   * @internal
   */
  function createInlinePlugin(pkg: Package): Record<string, Function> {
    const { dir, name, plugins } = pkg;
    const debugPrefix = `[${name}]`;

    /**
     * @param pluginOptions - Options to configure this plugin.
     * @param context - The semantic-release context.
     * @returns void
     * @internal
     */
    const verifyConditions = async (
      pluginOptions: any,
      context: any,
    ): Promise<any> => {
      // Restore context for plugins that does not rely on parsed opts.
      Object.assign(context.options, context.options._pkgOptions);

      // And bind the actual logger.
      Object.assign(pkg.fakeLogger, context.logger);

      const result = await plugins.verifyConditions(context);

      // @ts-expect-error Property '_ready' does not exist on type 'Package'
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
      pluginOptions: any,
      context: any,
    ): Promise<string | null> => {
      pkg._preRelease = context.branch.prerelease || null;
      pkg._branch = context.branch.name;

      // Filter commits by directory.
      const firstParentBranch = options.firstParent
        ? context.branch.name
        : undefined;

      // Set context.commits so analyzeCommits does correct analysis.

      context.commits = await getCommitsFiltered(
        cwd,
        dir,
        context.lastRelease ? context.lastRelease.gitHead : undefined,
        context.nextRelease ? context.nextRelease.gitHead : undefined,
        firstParentBranch,
      );

      // Set lastRelease for package from context.
      pkg._lastRelease = context.lastRelease;

      // Set nextType for package from plugins.
      pkg._nextType = await plugins.analyzeCommits(context);

      pkg._analyzed = true;

      // Make sure type is "patch" if the package has any deps that have been changed.
      // @ts-expect-error Type 'undefined' is not assignable to type 'string'.
      pkg._nextType = resolveReleaseType(
        pkg,
        options.deps.bump,
        options.deps.release,
        [],
        options.deps.prefix,
      );

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
      pluginOptions: any,
      context: any,
    ): Promise<string> => {
      // Set nextRelease for package.
      pkg._nextRelease = context.nextRelease;

      // Wait until all todo packages are ready to generate notes.
      // await waitForAll("_nextRelease", (p) => p._nextType);

      // Vars.
      const notes: string[] = [];

      // get SHA of lastRelease if not already there (should have been done by Semantic Release...)
      if (
        context.lastRelease &&
        context.lastRelease.gitTag &&
        (!context.lastRelease.gitHead ||
          context.lastRelease.gitHead === context.lastRelease.gitTag)
      ) {
        context.lastRelease.gitHead = getTagHead(context.lastRelease.gitTag, {
          cwd: context.cwd,
          env: context.env,
        });
      }

      // Filter commits by directory (and release range)
      const firstParentBranch = options.firstParent
        ? context.branch.name
        : undefined;

      // Set context.commits so generateNotes does correct analysis.

      context.commits = await getCommitsFiltered(
        cwd,
        dir,
        context.lastRelease ? context.lastRelease.gitHead : undefined,
        context.nextRelease ? context.nextRelease.gitHead : undefined,
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
      const upgrades = pkg.localDeps?.filter((d: any) => d._nextRelease);

      if (upgrades && upgrades.length > 0) {
        notes.push(`### Dependencies`);

        const bullets = upgrades.map(
          (d: any) => `* **${d.name}:** upgraded to ${d._nextRelease.version}`,
        );

        notes.push(bullets.join('\n'));
      }

      logger.debug(debugPrefix, 'notes generated');

      // Return the notes.
      return notes.join('\n\n');
    };

    const prepare = async (pluginOptions: any, context: any): Promise<any> => {
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
        context.lastRelease ? context.lastRelease.gitHead : undefined,
        context.nextRelease ? context.nextRelease.gitHead : undefined,
        firstParentBranch,
      );

      const result = await plugins.prepare(context);

      pkg._prepared = true;

      logger.debug(debugPrefix, 'prepared');

      return result;
    };

    const publish = async (
      pluginOptions: any,
      context: any,
    ): Promise<Record<string, any>> => {
      const result = await plugins.publish(context);

      pkg._published = true;

      logger.debug(debugPrefix, 'published');

      return result.length > 0 ? result[0] : {};
    };

    const inlinePlugin = {
      analyzeCommits,
      generateNotes,
      prepare,
      publish,
      verifyConditions,
    };

    // Add labels for logs.
    Object.keys(inlinePlugin).forEach((type) =>
      // @ts-expect-error Element implicitly has an 'any' type
      Reflect.defineProperty(inlinePlugin[type], 'pluginName', {
        enumerable: true,
        value: 'Inline plugin',
        writable: false,
      }),
    );

    logger.debug(debugPrefix, 'inlinePlugin created');

    return inlinePlugin;
  }

  // Return creator function.
  return createInlinePlugin;
}
