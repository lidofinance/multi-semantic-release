import { describe, it, expect } from 'vitest';

import { mergeConfig } from './merge-config.js';
import type { ReleaseOptions } from '../types.js';

describe('mergeConfig', () => {
  it('lets b override scalar values from a', () => {
    const result = mergeConfig({ tagFormat: 'x' }, { tagFormat: 'y' });
    expect(result.tagFormat).toBe('y');
  });

  it('does not let null/undefined in b clobber a', () => {
    const result = mergeConfig({ tagFormat: 'x' }, {
      tagFormat: undefined,
    } as ReleaseOptions);
    expect(result.tagFormat).toBe('x');
  });

  it('merges nested deps, keeping a-keys not present in b', () => {
    const result = mergeConfig(
      { deps: { bump: 'override', release: 'patch', prefix: '' } },
      { deps: { bump: 'satisfy' } } as ReleaseOptions,
    );
    expect(result.deps).toEqual({
      bump: 'satisfy',
      release: 'patch',
      prefix: '',
    });
  });

  it('unions and de-duplicates ignorePackages', () => {
    const result = mergeConfig({ ignorePackages: ['a', 'b'] }, {
      ignorePackages: ['b', 'c'],
    } as ReleaseOptions);
    expect(result.ignorePackages).toEqual(['a', 'b', 'c']);
  });

  it('casts a non-array ignorePackages to an array', () => {
    const result = mergeConfig({}, {
      ignorePackages: 'a',
    } as unknown as ReleaseOptions);
    expect(result.ignorePackages).toEqual(['a']);
  });
});
