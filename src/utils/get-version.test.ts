import { describe, it, expect } from 'vitest';

import { getHighestVersion, getLatestVersion } from './get-version.js';

describe('getHighestVersion', () => {
  it('returns the greater of two versions', () => {
    expect(getHighestVersion('1.2.3', '1.3.0')).toBe('1.3.0');
    expect(getHighestVersion('2.0.0', '1.9.9')).toBe('2.0.0');
  });

  it('returns the only defined version when one is missing', () => {
    expect(getHighestVersion(undefined, '1.0.0')).toBe('1.0.0');
    expect(getHighestVersion('1.0.0', undefined)).toBe('1.0.0');
  });

  it('returns undefined when both are missing', () => {
    expect(getHighestVersion(undefined, undefined)).toBeUndefined();
  });
});

describe('getLatestVersion', () => {
  it('returns the highest stable version', () => {
    expect(getLatestVersion(['1.0.0', '2.0.0', '1.5.0'])).toBe('2.0.0');
  });

  it('ignores prereleases unless withPrerelease is set', () => {
    expect(getLatestVersion(['1.0.0', '2.0.0-alpha.1'])).toBe('1.0.0');
    expect(getLatestVersion(['1.0.0', '2.0.0-alpha.1'], true)).toBe(
      '2.0.0-alpha.1',
    );
  });

  it('returns undefined for an empty list', () => {
    expect(getLatestVersion([])).toBeUndefined();
  });
});
