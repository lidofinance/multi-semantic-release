import { cosmiconfig } from 'cosmiconfig';

/** Name of the configuration. */
const CONFIG_NAME = 'release';

/** Supported configuration file names. */
const CONFIG_FILES: string[] = [
  'package.json',
  `.${CONFIG_NAME}rc`,
  `.${CONFIG_NAME}rc.json`,
  `.${CONFIG_NAME}rc.yaml`,
  `.${CONFIG_NAME}rc.yml`,
  `.${CONFIG_NAME}rc.js`,
  `.${CONFIG_NAME}rc.cjs`,
  `${CONFIG_NAME}.config.js`,
  `${CONFIG_NAME}.config.cjs`,
];

/**
 * Get the release configuration options for a given directory.
 *
 * @param cwd - The directory to search.
 * @returns The found configuration object, or an empty object if none found.
 * @internal
 */
export async function getConfig(cwd: string): Promise<Record<string, unknown>> {
  const config = await cosmiconfig(CONFIG_NAME, {
    mergeSearchPlaces: false,
    searchPlaces: CONFIG_FILES,
  }).search(cwd);

  return config ? config.config : {};
}
