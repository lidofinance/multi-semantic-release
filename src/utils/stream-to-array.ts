export function streamToArray(stream: any): Promise<any[]> {
  if (!stream.readable) {
    return Promise.resolve([]);
  }

  return new Promise((resolve, reject) => {
    // stream is already ended
    if (!stream.readable) {
      resolve([]);

      return;
    }

    let array: any[] = [];

    function cleanup() {
      array = [];

      stream.removeListener('data', onData);
      stream.removeListener('end', onEnd);
      stream.removeListener('error', onError);
      stream.removeListener('close', onClose);
    }

    function onData(document: any) {
      array.push(document);
    }

    function onEnd() {
      resolve(array);
      cleanup();
    }

    function onError(error: Error) {
      reject(error);
      cleanup();
    }

    function onClose() {
      resolve(array);
      cleanup();
    }

    stream.on('data', onData);
    stream.on('end', onEnd);
    stream.on('error', onEnd);
    stream.on('close', onClose);
  });
}
