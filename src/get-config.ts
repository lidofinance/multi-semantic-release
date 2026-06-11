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
 * Loads semantic‑release configuration for a directory using cosmiconfig.
 * Returns the found config object or an empty object when none.
 * @param cwd Directory to start the search
 * @returns Loaded configuration or an empty object
 */
export async function getConfig(cwd: string): Promise<Record<string, unknown>> {
  const config = await cosmiconfig(CONFIG_NAME, {
    mergeSearchPlaces: false,
    searchPlaces: CONFIG_FILES,
  }).search(cwd);

  return config ? (config.config as Record<string, unknown>) : {};
}
