import { describe, it, expect } from 'vitest';

import { recognizeFormat } from './recognize-format.js';

describe('recognizeFormat', () => {
  it('detects 2-space indentation and a trailing newline', () => {
    const { indent, trailingWhitespace } = recognizeFormat('{\n  "a": 1\n}\n');
    expect(indent).toBe('  ');
    expect(trailingWhitespace).toBe('\n');
  });

  it('detects tab indentation', () => {
    expect(recognizeFormat('{\n\t"a": 1\n}').indent).toBe('\t');
  });

  // Regression: detectIndent returns '' when it cannot determine indentation;
  // without the `|| 2` fallback the rewritten manifest would be minified.
  it('falls back to a 2-space indent when none can be detected', () => {
    expect(recognizeFormat('{"a":1}').indent).toBe(2);
  });

  it('returns empty trailing whitespace when there is no newline', () => {
    expect(recognizeFormat('{"a":1}').trailingWhitespace).toBe('');
  });
});
