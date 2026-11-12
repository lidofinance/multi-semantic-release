import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getPackage } from './get-package.js';
import type { MultiContext, Package } from './types.js';

// Real semantic-release plugin loading (no mocks): --verify-conditions must
// replace the configured verifyConditions plugins, e.g. drop @semantic-release/npm.
const sink = new Writable({ write: (_c, _e, cb) => cb() });
const logger = { log() {}, error() {}, success() {}, warn() {} };

let dir: string;
let marker: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'msr-get-package-'));
  marker = join(dir, 'called.txt');
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({
      name: 'pkg-a',
      version: '1.0.0',
      repository: { url: 'https://github.com/example/repo.git' },
    }),
  );
  writeFileSync(
    join(dir, 'fake-plugin.mjs'),
    `import { writeFileSync } from 'node:fs';
export const verifyConditions = () => writeFileSync(${JSON.stringify(marker)}, 'ok');`,
  );
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const load = (verifyConditions?: string[]): Promise<Package> =>
  getPackage(join(dir, 'package.json'), {
    cwd: dir,
    // No NPM_TOKEN and no CI provider: @semantic-release/npm verify must fail.
    env: { PATH: process.env.PATH },
    globalOptions: {},
    stderr: sink,
    stdout: sink,
    verifyConditions,
  } as MultiContext);

const runVerify = (pkg: Package): Promise<unknown> =>
  (pkg.plugins.verifyConditions as (ctx: unknown) => Promise<unknown>)({
    cwd: dir,
    env: { PATH: process.env.PATH },
    options: pkg.options,
    logger,
    stderr: sink,
    stdout: sink,
  });

describe('getPackage verifyConditions override', () => {
  it('runs only the plugins passed via --verify-conditions', async () => {
    const pkg = await load([join(dir, 'fake-plugin.mjs')]);
    await expect(runVerify(pkg)).resolves.not.toThrow();
    expect(existsSync(marker)).toBe(true);
  });

  it('keeps the default plugins (incl. npm) without the override', async () => {
    const pkg = await load();
    const error = (await runVerify(pkg).catch((e: unknown) => e)) as {
      errors?: { code?: string }[];
    };
    // ENONPMTOKEN or EINVALIDNPMTOKEN, depending on the machine's ~/.npmrc.
    expect(error.errors?.map((e) => e.code)).toEqual(
      expect.arrayContaining([expect.stringMatching(/NPMTOKEN$/)]),
    );
  });
});
