import { appendFile } from 'node:fs/promises';

import type { Package } from '../types.js';

const escapeCell = (value: string): string => value.replaceAll('|', '\\|');

/**
 * Renders a markdown summary of the packages that are going to be (or were) released.
 * @param packages Packages after the release run, with `_nextRelease` populated
 * @param dryRun Whether the run was a dry-run (affects the heading only)
 * @returns Markdown string
 */
export const renderReleaseSummary = (
  packages: Package[],
  dryRun: boolean,
): string => {
  const releasing = packages.filter((pkg) => pkg.result && pkg._nextRelease);
  const title = dryRun ? 'Packages to be released' : 'Released packages';

  if (releasing.length === 0) {
    return `## ${title}\n\nNothing to release.\n`;
  }

  const rows = releasing.map((pkg) => {
    const channel = pkg._preRelease ?? 'stable';
    const from = pkg._lastRelease?.version ?? '—';
    const to = pkg._nextRelease?.version ?? '—';
    const type = pkg._nextType ?? '—';

    return `| ${escapeCell(pkg.name)} | ${from} | **${to}** | ${type} | ${escapeCell(channel)} |`;
  });

  return [
    `## ${title}`,
    '',
    '| Package | Current | Next | Type | Channel |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
};

/**
 * Appends the release summary to the GitHub Actions job summary.
 * No-op outside of GitHub Actions (when `GITHUB_STEP_SUMMARY` is not set).
 * @param packages Packages after the release run
 * @param dryRun Whether the run was a dry-run
 * @param env Environment variables
 * @returns True if the summary was written
 */
export const writeGithubSummary = async (
  packages: Package[],
  dryRun: boolean,
  env: Record<string, string | undefined>,
): Promise<boolean> => {
  const summaryPath = env.GITHUB_STEP_SUMMARY;

  if (!summaryPath) {
    return false;
  }

  await appendFile(summaryPath, renderReleaseSummary(packages, dryRun));

  return true;
};
