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
    indent: detectIndent(contents).indent,
    trailingWhitespace: detectNewline(contents) || '',
  };
}
