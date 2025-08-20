# Lido Multi-Semantic Release

A modern TypeScript wrapper around [semantic-release](https://github.com/semantic-release/semantic-release) that enables automated semantic versioning for monorepo workspaces. This tool manages the release process for multiple interdependent packages while respecting dependency relationships and topological order.

## Features

- 🏗️ **Monorepo Support**: Automatically discovers and releases multiple packages in correct dependency order
- 📦 **Dependency Management**: Handles local dependencies and version updates between packages
- 🔄 **Topological Sorting**: Ensures packages are released in the correct order based on dependencies
- 🏷️ **Custom Tagging**: Configurable tag format for package releases
- 🧪 **Dry Run Mode**: Test releases without making actual changes
- 🔕 **Flexible Logging**: Silent, debug, and verbose logging options
- ⚡ **Performance Options**: Sequential or parallel initialization and preparation

## Installation

### Global Installation

```bash
npm install -g @lidofinance/multi-semantic-release
```

### Project Installation

```bash
npm install --save-dev @lidofinance/multi-semantic-release
# or
yarn add -D @lidofinance/multi-semantic-release
```

## Usage

### Basic Usage

```bash
npx multi-semantic-release
```

### CLI Options

| Option                            | Description                                                       | Default              |
| --------------------------------- | ----------------------------------------------------------------- | -------------------- |
| `-d, --dry-run`                   | Run without making changes                                        | `false`              |
| `-s, --silent`                    | Suppress output                                                   | `false`              |
| `--debug`                         | Enable debug logging                                              | `false`              |
| `--sequential-init`               | Avoid concurrent initialization                                   | `false`              |
| `--sequential-prepare`            | Avoid concurrent preparation (avoid with cyclic deps)             | `false`              |
| `--first-parent`                  | Apply commit filtering to current branch only                     | `false`              |
| `--deps.bump <rule>`              | Version update rule: `override`, `satisfy`, `inherit`             | -                    |
| `--deps.release <type>`           | Release type for dependents: `patch`, `minor`, `major`, `inherit` | -                    |
| `--deps.prefix <prefix>`          | Version prefix: `^`, `~`, or empty                                | -                    |
| `--ignore-packages <packages...>` | Packages to ignore during release                                 | `[]`                 |
| `--ignore-private`                | Exclude private packages                                          | `true`               |
| `--tag-format <format>`           | Tag format template                                               | `${name}@${version}` |

### Examples

```bash
# Dry run to see what would be released
multi-semantic-release --dry-run

# Release with debug information
multi-semantic-release --debug

# Ignore specific packages
multi-semantic-release --ignore-packages package-a package-b

# Custom dependency bumping
multi-semantic-release --deps.bump override --deps.release patch --deps.prefix "^"

# Custom tag format
multi-semantic-release --tag-format "v${version}"
```

## Configuration

Multi-semantic-release uses [cosmiconfig](https://github.com/davidtheclark/cosmiconfig) for configuration. You can configure it via:

- `.multi-semantic-releaserc` (JSON or YAML)
- `.multi-semantic-releaserc.json`
- `.multi-semantic-releaserc.yaml`
- `package.json` field: `multiSemanticRelease`

### Example Configuration

```json
{
  "tagFormat": "${name}@${version}",
  "ignorePrivate": true,
  "deps": {
    "bump": "override",
    "release": "patch",
    "prefix": "^"
  },
  "ignorePackages": ["@internal/testing-utils"]
}
```

## How It Works

1. **Discovery**: Scans the workspace for packages using topological sorting
2. **Analysis**: Analyzes commits for each package to determine version bumps
3. **Dependency Resolution**: Updates interdependent package versions
4. **Release**: Publishes packages in dependency order
5. **Tagging**: Creates git tags for released versions

## Requirements

- Node.js >= 20.0.0
- Git repository with conventional commits
- Workspace-based monorepo (npm workspaces, yarn workspaces, etc.)

## Development

```bash
# Install dependencies
yarn install

# Development mode with hot reload
yarn dev

# Build for production
yarn build

# Lint and format
yarn lint
yarn format

# Type checking
yarn types
```

## License

MIT
