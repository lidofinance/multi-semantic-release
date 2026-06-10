/**
 * Base configuration options shared between CLI and config files.
 */
export interface BaseConfig {
  firstParent?: boolean;
  deps?: DependencyConfig;
  tagFormat?: string;
  debug?: boolean;
  dryRun?: boolean;
  ci?: boolean;
  branches?: string[];
  ignorePackages?: string[];
  ignorePrivate?: boolean;
  [key: string]: unknown;
}

/**
 * CLI-specific options that extend base configuration.
 * Includes dot-notation properties for nested deps config.
 */
export interface ReleaseOptions extends BaseConfig {
  silent?: boolean;
  sequentialInit?: boolean;
  sequentialPrepare?: boolean;
  'deps.bump'?: string;
  'deps.release'?: string;
  'deps.prefix'?: string;
  'deps.pullTagsForPrerelease'?: boolean;
}

/**
 * Internal configuration used by package processing functions.
 * Similar to BaseConfig but with package-specific extensions.
 */
export interface OptionsConfig extends BaseConfig {
  _pkgOptions?: Record<string, unknown>;
}

/** Minimal logger interface used by this project */
export type Logger = {
  error: (...args: unknown[]) => void;
  log: (...args: unknown[]) => void;
  success: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
};

/**
 * Runtime context passed between semantic-release core and plugins.
 * Mirrors the subset used by multi-semantic-release.
 */
export interface SemanticReleaseContext {
  branch: {
    name: string;
    prerelease?: string;
    tags?: { version?: string; gitTag?: string }[];
  };
  commits: unknown[];
  cwd: string;
  env: Record<string, string | undefined>;
  lastRelease?: {
    gitHead?: string;
    gitTag?: string;
  };
  nextRelease?: {
    gitHead?: string;
    version?: string;
  };
  logger: Logger;
  options: {
    _pkgOptions?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

/** Configuration for dependency bumping and release behavior */
export interface DependencyConfig {
  bump: string;
  release: string;
  prefix: string;
  /** Consider existing git tags when computing a dependency's next prerelease version. */
  pullTagsForPrerelease?: boolean;
}

/** Contract for the semantic-release plugin hooks used by this project */
export interface SemanticReleasePlugins {
  verifyConditions(context: SemanticReleaseContext): Promise<unknown>;
  analyzeCommits(context: SemanticReleaseContext): Promise<string | null>;
  generateNotes(context: SemanticReleaseContext): Promise<string>;
  prepare(context: SemanticReleaseContext): Promise<unknown>;
  publish(context: SemanticReleaseContext): Promise<Record<string, unknown>[]>;
  success(context: SemanticReleaseContext): Promise<void>;
  fail(context: SemanticReleaseContext): Promise<void>;
}

/** Shape of generated inline plugin used to wrap per-package plugin calls */
export interface InlineSemanticReleasePlugin {
  analyzeCommits: (
    _pluginOptions: unknown,
    context: SemanticReleaseContext,
  ) => Promise<string | null>;
  generateNotes: (
    _pluginOptions: unknown,
    context: SemanticReleaseContext,
  ) => Promise<string>;
  prepare: (
    _pluginOptions: unknown,
    context: SemanticReleaseContext,
  ) => Promise<unknown>;
  publish: (
    _pluginOptions: unknown,
    context: SemanticReleaseContext,
  ) => Promise<Record<string, unknown>>;
  verifyConditions: (
    _pluginOptions: unknown,
    context: SemanticReleaseContext,
  ) => Promise<unknown>;
}

/** Represents a workspace/package participating in multi-semantic-release */
export type Package = {
  path: string; // String path to `package.json` for the package.
  dir: string; // The working directory for the package.
  name: string; // The name of the package, e.g. `my-amazing-package`
  deps: string[]; // Array of all dependency package names for the package.
  fakeLogger?: Logger; // A fake logger for the package.
  manifest?: Manifest; // The package's `package.json` file contents.
  localDeps?: Package[]; // Array of local dependencies this package relies on.
  options: OptionsConfig; // The package-specific options.
  plugins: SemanticReleasePlugins; // The plugins object for the package.
  context?: SemanticReleaseContext | void; // The semantic-release context for this package's release.
  result?: Record<string, unknown> | false | undefined; // The result of semantic-release, false if skipped, or undefined if not completed.
  _lastRelease?: {
    version?: string;
    gitHead?: string;
    gitTag?: string;
  }; // The last release object for the package before its current release.
  _nextRelease?: {
    version?: string;
    gitHead?: string;
    gitTag?: string;
  }; // The next release object for this cycle.
  _preRelease?: string | null;
  _tags?: string[]; // Known released versions for this package (from git tags), used to pick the next prerelease without collisions.
  _branch?: string; // The branch name for the package.
  _nextType?: string | undefined; // The next release type for the package, e.g. "major", "minor", "patch", or "none".
  _analyzed?: boolean; // Whether the package has been analyzed for commits.
  _depsUpdated?: boolean; // Whether the package's dependencies have been updated.
  _prepared?: boolean; // Whether the package has been prepared for release.
  _published?: boolean; // Whether the package has been published.
  _ready?: boolean; // Whether the package is ready to be released.
};

/** Parsed representation of a package.json manifest used by the toolchain */
export interface Manifest {
  name: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  __contents__?: string;
}

/** Shared execution context for a multi-release run */
export type MultiContext = {
  cwd: string; // The current working directory.
  env: Record<string, string | undefined>; // The environment variables.
  globalOptions: Record<string, unknown>; // Global options for the multi-semantic-release.
  stderr: unknown; // The error stream for this multirelease.
  stdout: unknown; // The output stream for this multirelease.
};
