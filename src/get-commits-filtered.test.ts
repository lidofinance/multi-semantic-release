import { describe, it, expect } from 'vitest';

import { getCommitsFiltered } from './get-commits-filtered.js';

describe('getCommitsFiltered path guard', () => {
  // Regression (MEDIUM): the old `indexOf(cwd) !== 0` check treated a sibling
  // like `<cwd>2` as being inside `<cwd>`. The separator-aware check rejects it.
  it('rejects a sibling dir that merely shares a name prefix with cwd', async () => {
    await expect(
      getCommitsFiltered('/repo/pkg-a', '/repo/pkg-a2'),
    ).rejects.toThrow(/Must be inside cwd/u);
  });

  it('rejects a dir equal to cwd', async () => {
    await expect(getCommitsFiltered('/repo/pkg', '/repo/pkg')).rejects.toThrow(
      /Must not be equal to cwd/u,
    );
  });

  it('rejects a dir outside cwd', async () => {
    await expect(
      getCommitsFiltered('/repo/pkg-a', '/repo/other'),
    ).rejects.toThrow(/Must be inside cwd/u);
  });
});
