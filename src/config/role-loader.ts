import { readFileSync } from 'fs';
import { extname } from 'path';
import { ConfigError } from '../errors/index.js';
import type { Config } from './schema.js';

/**
 * Load a role/persona configuration from a file.
 *
 * Supports two formats:
 * - **JSON** (`.json`): Parses and returns persona fields directly
 *   (name, role, background, instructions, introduceOnStart)
 * - **Markdown/text** (`.md`, `.txt`, or any other): Returns entire
 *   file content as the `background` field
 *
 * @param rolePath - Path to the role file (resolved relative to cwd)
 * @returns Partial persona config to merge with defaults
 * @throws ConfigError if file cannot be read or JSON is malformed
 *
 * @example
 * ```typescript
 * // Markdown role file
 * const persona = loadRole('./roles/engineer.md');
 * // { background: "# Senior Engineer\n\nExpert in distributed systems..." }
 *
 * // JSON role file
 * const persona = loadRole('./roles/advisor.json');
 * // { name: "Dr. Smith", role: "Technical Advisor", ... }
 * ```
 */
export function loadRole(rolePath: string): Partial<Config['persona']> {
  let content: string;
  try {
    content = readFileSync(rolePath, 'utf8');
  } catch (err) {
    throw new ConfigError(
      `Cannot read role file: ${rolePath}: ${(err as Error).message}`,
      'Check the --role path exists and is readable'
    );
  }

  const ext = extname(rolePath).toLowerCase();
  if (ext === '.json') {
    try {
      return JSON.parse(content) as Partial<Config['persona']>;
    } catch (err) {
      throw new ConfigError(
        `Invalid JSON in role file: ${rolePath}: ${(err as Error).message}`,
        'Role file must be valid JSON with persona fields (name, role, background, instructions)'
      );
    }
  }

  // Markdown, text, or any other format — treat as background content
  return { background: content };
}
