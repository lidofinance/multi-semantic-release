import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';

import { streamToArray } from './stream-to-array.js';

describe('streamToArray', () => {
  it('collects all emitted objects into an array', async () => {
    const stream = Readable.from([{ a: 1 }, { b: 2 }], { objectMode: true });

    await expect(streamToArray(stream)).resolves.toEqual([{ a: 1 }, { b: 2 }]);
  });

  // Regression: the 'error' event was wired to the resolve handler, so a stream
  // error silently resolved with partial/empty data instead of rejecting.
  it('rejects when the stream emits an error', async () => {
    const stream = new Readable({ objectMode: true, read() {} });
    void Promise.resolve().then(() => stream.emit('error', new Error('boom')));

    await expect(streamToArray(stream)).rejects.toThrow('boom');
  });

  it('resolves with an empty array for a non-readable stream', async () => {
    const stream = new Readable({ read() {} });
    stream.destroy();

    await expect(streamToArray(stream)).resolves.toEqual([]);
  });
});
