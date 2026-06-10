import { describe, it, expect } from 'vitest';
import { Writable } from 'node:stream';

import { RescopedStream } from './rescoped-stream.js';

// A simple in-memory sink to capture what gets forwarded.
const sink = (): { stream: Writable; output: () => string } => {
  const chunks: string[] = [];
  const stream = new Writable({
    decodeStrings: false,
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  });
  return { stream, output: () => chunks.join('') };
};

describe('RescopedStream', () => {
  it('rewrites the [semantic-release] scope when forwarding', async () => {
    const { stream, output } = sink();
    const rescoped = new RescopedStream(stream, 'my-pkg');

    rescoped.write('[semantic-release] hello\n');
    await new Promise<void>((resolve) => rescoped.end(resolve));

    expect(output()).toBe('[my-pkg] hello\n');
  });

  it('forwards chunks without the scope token unchanged', async () => {
    const { stream, output } = sink();
    const rescoped = new RescopedStream(stream, 'my-pkg');

    rescoped.write('plain line\n');
    await new Promise<void>((resolve) => rescoped.end(resolve));

    expect(output()).toBe('plain line\n');
  });

  it('honors the Writable contract: invokes the write callback', async () => {
    const { stream } = sink();
    const rescoped = new RescopedStream(stream, 'scope');

    const wrote = await new Promise<boolean>((resolve) => {
      const ok = rescoped.write('x', () => resolve(true));
      // returns a boolean per the Writable contract
      expect(typeof ok).toBe('boolean');
    });

    expect(wrote).toBe(true);
  });
});
