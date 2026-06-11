import { Writable } from 'node:stream';

/**
 * A writable stream that rewrites the scope in messages.
 * Replaces `[semantic-release]` with a custom scope (e.g. `[my-awesome-package]`) so output makes more sense.
 * @param stream The actual stream to write messages to.
 * @param scope The string scope for the stream (instances of the text `[semantic-release]` are replaced in the stream).
 * @returns Object that's compatible with stream.Writable (implements a `write()` property).
 * @internal
 */
export class RescopedStream extends Writable {
  private _stream: Writable;
  private _scope: string;

  constructor(stream: Writable, scope: string) {
    super({ decodeStrings: false });
    this._stream = stream;
    this._scope = scope;
  }

  /**
   * Forward a chunk to the underlying stream, rewriting the scope. Implemented
   * as `_write` (rather than overriding `write`) so the base `Writable` keeps
   * honoring the encoding/callback/backpressure contract.
   * @param chunk The chunk to write.
   * @param _encoding Source encoding (unused — we forward as text).
   * @param callback Signals completion (or error) to the stream machinery.
   */
  override _write(
    chunk: unknown,
    _encoding: string,
    callback: (error?: Error | null) => void,
  ): void {
    const message = String(chunk).replace(
      '[semantic-release]',
      `[${this._scope}]`,
    );
    this._stream.write(message, callback);
  }
}
