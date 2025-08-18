import type { Readable } from 'node:stream';

export function streamToArray<T = unknown>(stream: Readable): Promise<T[]> {
  if (!stream.readable) {
    return Promise.resolve([]);
  }

  return new Promise((resolve, reject) => {
    // stream is already ended
    if (!stream.readable) {
      resolve([]);

      return;
    }

    let array: T[] = [];

    function cleanup(): void {
      array = [];

      stream.removeListener('data', onData);
      stream.removeListener('end', onEnd);
      stream.removeListener('error', onError);
      stream.removeListener('close', onClose);
    }

    function onData(document: T): void {
      array.push(document);
    }

    function onEnd(): void {
      resolve(array);
      cleanup();
    }

    function onError(error: Error): void {
      reject(error);
      cleanup();
    }

    function onClose(): void {
      resolve(array);
      cleanup();
    }

    stream.on('data', onData);
    stream.on('end', onEnd);
    stream.on('error', onEnd);
    stream.on('close', onClose);
  });
}
