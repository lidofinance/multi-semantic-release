import { describe, it, expect, vi, afterEach } from 'vitest';

import { consoleLog } from './console.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('consoleLog', () => {
  it('writes the message through console.log (default type)', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleLog('hello world');
    expect(spy).toHaveBeenCalledOnce();
    expect(String(spy.mock.calls[0]?.[0])).toContain('hello world');
  });

  it('accepts a known message type', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleLog('boom', 'Error');
    expect(String(spy.mock.calls[0]?.[0])).toContain('boom');
  });
});
