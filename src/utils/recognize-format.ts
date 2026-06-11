import detectIndent from 'detect-indent';
import { detectNewline } from 'detect-newline';

/**
 * Information about the format of a file.
 */
export interface FileFormat {
  indent: string | number;
  trailingWhitespace: string;
}

/**
 * Detects the indentation and trailing whitespace of a file.
 * @param contents contents of the file
 * @returns Formatting of the file
 */
export function recognizeFormat(contents: string): FileFormat {
  return {
    // Fall back to 2-space indent when detection fails (empty string would
    // otherwise minify the rewritten JSON onto a single line).
    indent: detectIndent(contents).indent || 2,
    trailingWhitespace: detectNewline(contents) || '',
  };
}
