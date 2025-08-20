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
    super();
    this._stream = stream;
    this._scope = scope;
  }

  /**
   * Write a message to the underlying stream, replacing the scope.
   * @param message The message to write.
   */
  override write(message: string): boolean {
    return this._stream.write(
      message.replace('[semantic-release]', `[${this._scope}]`),
    );
  }
}
