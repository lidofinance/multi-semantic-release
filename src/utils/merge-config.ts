import { castArray, pickBy } from 'lodash-es';

export const mergeConfig = (a: any, b: any) => {
  return {
    ...a,
    // Remove `null` and `undefined` options so they can be replaced with default ones
    ...pickBy(b, (option) => option != null),
    // Treat nested objects differently as otherwise we'll loose undefined keys
    deps: {
      ...a.deps,
      ...pickBy(b.deps, (option) => option != null),
    },
    // Treat arrays differently by merging them
    ignorePackages: [
      ...new Set([
        ...castArray(a.ignorePackages || []),
        ...castArray(b.ignorePackages || []),
      ]),
    ],
  };
};
