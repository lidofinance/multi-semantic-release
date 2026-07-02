<h1 align="center">🏗️ multi-semantic-release</h1>

<p align="center">
  <strong>Automated semantic versioning for monorepos — on top of <a href="https://github.com/semantic-release/semantic-release">semantic-release</a>.</strong>
</p>

<p align="center">
  A modern, ESM-first TypeScript wrapper that releases multiple interdependent workspace
  packages in the correct topological order, cascading version bumps across local dependencies.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@lidofinance/multi-semantic-release"><img alt="npm" src="https://img.shields.io/npm/v/@lidofinance/multi-semantic-release?color=cb3837&logo=npm"></a>
  <a href="https://www.npmjs.com/package/@lidofinance/multi-semantic-release"><img alt="node" src="https://img.shields.io/node/v/@lidofinance/multi-semantic-release?color=339933&logo=node.js"></a>
  <a href="https://github.com/lidofinance/multi-semantic-release/actions/workflows/checks.yml"><img alt="checks" src="https://github.com/lidofinance/multi-semantic-release/actions/workflows/checks.yml/badge.svg"></a>
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/npm/l/@lidofinance/multi-semantic-release?color=blue"></a>
</p>

---

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
- [CLI options](#cli-options)
- [Configuration](#configuration)
- [Prerelease channels & tag-aware versioning](#prerelease-channels--tag-aware-versioning)
- [Workspace protocol](#workspace-protocol)
- [Programmatic API](#programmatic-api)
- [How it works](#how-it-works)
- [Development](#development)
- [License](#license)

## Features

- 🏗️ **Monorepo support** — automatically discovers all workspace packages and releases them.
- 🔄 **Topological order** — packages are released respecting their dependency graph.
- 📦 **Dependency cascade** — when a package is released, its local dependents are bumped and re-released according to a configurable rule.
- 🏷️ **Tag-aware prerelease versioning** — picks the next prerelease above existing git tags to avoid collisions.
- 🔗 **Workspace protocol** — resolves `workspace:` ranges (Yarn Berry / pnpm) to concrete versions on publish.
- 🧪 **Dry-run mode** — preview what would be released without changing anything.
- 🔕 **Logging control** — `--silent` and `--debug`.

## Requirements

- **Node.js `>= 24.10.0`** (matches `semantic-release` 25's engine support).
- A Git repository using [Conventional Commits](https://www.conventionalcommits.org/).
- A workspace-based monorepo (Yarn / npm / pnpm workspaces).

## Installation

```bash
# Yarn
yarn add -D @lidofinance/multi-semantic-release

# npm
npm install --save-dev @lidofinance/multi-semantic-release

# or globally
npm install -g @lidofinance/multi-semantic-release
```

## Usage

Run from the monorepo root:

```bash
npx multi-semantic-release
```

Typically you run it in CI on a release branch, exactly like `semantic-release` — it reads
each package's `semantic-release` configuration and runs the full lifecycle per package.

### Examples

```bash
# Preview what would be released
multi-semantic-release --dry-run

# Verbose diagnostics
multi-semantic-release --debug

# Dependency bumping rules
multi-semantic-release --deps.bump override --deps.release patch --deps.prefix "^"

# Ignore packages and use a custom tag format
multi-semantic-release --ignore-packages @internal/test-utils --tag-format "v${version}"
```

## CLI options

| Option                                | Description                                                                                               | Default              |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------- |
| `-d, --dry-run`                       | Run without publishing or pushing anything.                                                               | `false`              |
| `-s, --silent`                        | Do not print configuration information.                                                                   | `false`              |
| `--debug`                             | Output debug logging.                                                                                     | `false`              |
| `--sequential-init`                   | Load/initialize packages one-by-one instead of in parallel (avoids concurrent init collisions).           | `false`              |
| `--sequential-prepare`                | Accepted for compatibility — releases always run sequentially per package.¹                               | `true`               |
| `--first-parent`                      | Apply commit filtering to the current branch only.                                                        | `false`              |
| `--deps.bump <rule>`                  | How to rewrite a changed dependency's version: `override`, `satisfy`, `inherit`.                          | `override`           |
| `--deps.release <type>`               | Release type for a dependent when one of its local deps changes: `patch`, `minor`, `major`, `inherit`.    | `patch`              |
| `--deps.prefix <prefix>`              | Prefix for the rewritten dep version when `--deps.bump=override`: `^`, `~`, or empty.                     | `""`                 |
| `--deps.pullTagsForPrerelease [bool]` | Consider existing git tags when computing a dependency's next **prerelease** version (avoids collisions). | `true`               |
| `--ignore-packages <pkgs...>`         | Packages to exclude from the release.                                                                     | `[]`                 |
| `--ignore-private`                    | Exclude `"private": true` packages (pass `--no-ignore-private` to include them).                          | `true`               |
| `--tag-format <format>`               | Git tag template. Supports `${name}` and `${version}`.                                                    | `${name}@${version}` |

> ¹ Packages are released sequentially in topological order, so `--sequential-prepare` currently has no effect; it is kept for CLI compatibility.

## Configuration

There are **two** independent configs.

### 1. multi-semantic-release config

Loaded via [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig) under the name **`multi-release`**:

- `package.json` → `"multi-release"` field
- `.multi-releaserc` / `.multi-releaserc.{json,yaml,yml,js,cjs}`
- `multi-release.config.{js,cjs}`

```jsonc
// package.json
{
  "multi-release": {
    "tagFormat": "${name}@${version}",
    "ignorePrivate": true,
    "ignorePackages": ["@internal/test-utils"],
    "deps": {
      "bump": "override",
      "release": "patch",
      "prefix": "^",
      "pullTagsForPrerelease": true,
    },
  },
}
```

CLI flags override config values.

### 2. semantic-release config (per package / root)

Standard `semantic-release` config (`release` key in `package.json`, `.releaserc`, etc.) — branches,
channels and plugins are resolved the usual way for each package:

```jsonc
{
  "release": {
    "branches": [
      "main",
      { "name": "develop", "channel": "alpha", "prerelease": "alpha" },
    ],
  },
}
```

## Prerelease channels & tag-aware versioning

On a prerelease branch (e.g. `develop` → `alpha`), each package is versioned like `1.4.0-alpha.N`.

When a dependency is bumped inside a dependent's manifest, the next prerelease version is computed
**tag-aware**: it takes the highest of "bump from the last release" and "bump from the highest
existing prerelease git tag". This prevents version collisions when prerelease tags run ahead of the
last recorded release (parallel prerelease lines, manual re-tagging, multiple channels).

Disable with `--deps.pullTagsForPrerelease=false` (or `deps.pullTagsForPrerelease: false` in config)
to always bump from the last release only.

> **Keep the prerelease branch in sync with the release branch.** semantic-release
> computes a package's own next version only from tags reachable on the current
> branch (`git tag --merged`). If `main` has a stable release the prerelease branch
> hasn't merged, the next prerelease would regress below that stable version. Merge
> `main` into `develop` before an alpha release (the standard semantic-release
> [pre-releases workflow](https://semantic-release.gitbook.io/semantic-release/recipes/release-workflow/pre-releases)).

## Workspace protocol

Cross-package dependencies declared with the workspace protocol are resolved to concrete versions on
publish:

| Declared      | Published (with `--deps.bump=override`) |
| ------------- | --------------------------------------- |
| `workspace:^` | `^<new version>`                        |
| `workspace:~` | `~<new version>`                        |
| `workspace:*` | `<new version>`                         |

## Programmatic API

```ts
import { multiSemanticRelease } from '@lidofinance/multi-semantic-release';

// Returns the workspace packages in topological order, with release info populated.
const packages = await multiSemanticRelease({
  cliOptions: {
    dryRun: true,
    deps: { bump: 'override', release: 'patch', prefix: '^' },
  },
});
```

> The package is ESM-only (`"type": "module"`).

## How it works

1. **Discover** — find all workspace packages and build their dependency graph (`@semrel-extra/topo`).
2. **Queue** — sort packages topologically so dependencies are released before dependents.
3. **Analyze** — for each package, filter commits to its directory and determine the release type from Conventional Commits.
4. **Cascade** — if a package's local dependency changed, bump the dependency range in its manifest and give it a release per `--deps.release`.
5. **Release** — run the `semantic-release` lifecycle per package: notes → tag → publish → GitHub release.

## Development

```bash
corepack enable     # activates the pinned Yarn Berry (packageManager field)
yarn install        # install dependencies (Yarn)
yarn dev            # run from source (tsx)
yarn build          # compile to dist/
yarn lint           # eslint
yarn format         # prettier --write
yarn types          # tsc --noEmit
yarn test           # vitest
yarn test:coverage  # vitest with coverage
```

## License

[MIT](./LICENSE)
