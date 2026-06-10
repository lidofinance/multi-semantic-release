import { describe, it, expect } from 'vitest';

import { cleanPath } from './clean-path.js';

describe('cleanPath', () => {
  it('strips trailing slashes from an absolute path', () => {
    expect(cleanPath('/a/b/')).toBe('/a/b');
    expect(cleanPath('/a/b///')).toBe('/a/b');
  });

  it('joins a relative path onto the provided cwd', () => {
    expect(cleanPath('b/c', '/a')).toBe('/a/b/c');
  });

  it('normalizes . and .. segments', () => {
    expect(cleanPath('/a/./b/../c')).toBe('/a/c');
  });

  it('leaves a clean absolute path unchanged', () => {
    expect(cleanPath('/a/b')).toBe('/a/b');
  });
});
