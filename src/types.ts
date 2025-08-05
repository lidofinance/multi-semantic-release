export type context = any;
export type Result = any;

export type Package = {
  path: string; // String path to `package.json` for the package.
  dir: string; // The working directory for the package.
  name: string; // The name of the package, e.g. `my-amazing-package`
  deps: string[]; // Array of all dependency package names for the package.
  fakeLogger?: any; // A fake logger for the package.
  manifest?: Manifest; // The package's `package.json` file contents.
  localDeps?: Package[]; // Array of local dependencies this package relies on.
  options: Record<string, any>; // The package-specific options.
  plugins: any; // The plugins object for the package.
  context?: context | void; // The semantic-release context for this package's release.
  result?: Result | false; // The result of semantic-release, false if skipped, or undefined if not completed.
  _lastRelease?: object; // The last release object for the package before its current release.
  _nextRelease?: object; // The next release object for this cycle.
  _preRelease?: string | null;
  _branch?: string; // The branch name for the package.
  _nextType?: string; // The next release type for the package, e.g. "major", "minor", "patch", or "none".
  _analyzed?: boolean; // Whether the package has been analyzed for commits.
  _depsUpdated?: boolean; // Whether the package's dependencies have been updated.
  _prepared?: boolean; // Whether the package has been prepared for release.
  _published?: boolean; // Whether the package has been published.
};

// package.json file contents
export type Manifest = {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

export type MultiContext = {
  cwd: string; // The current working directory.
  env: object; // The environment variables.
  globalOptions: Record<string, any>; // Global options for the multi-semantic-release.
  stderr: any; // The error stream for this multirelease.
  stdout: any; // The output stream for this multirelease.
};
