// Main entry point for the multi-semantic-release package.
// Exposes the programmatic API. The CLI lives in `cli.ts` (wired via the
// `bin` field) and must not be imported here — doing so would run the CLI as
// a side effect of `import`.

export { multiSemanticRelease } from './multi-semantic-release.js';
export type * from './types.js';
