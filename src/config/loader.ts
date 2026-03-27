import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { ConfigSchema, type Config } from './schema.js';
import { ConfigError } from '../errors/index.js';

/**
 * Load and validate configuration.
 *
 * Resolution order:
 * 1. If `configPath` provided, reads that file (throws ConfigError on missing/invalid)
 * 2. If no `configPath`, looks for `config.json` in current working directory
 * 3. If default config.json doesn't exist, returns full Zod defaults
 *
 * Uses `process.cwd()` for default config lookup (not import.meta.url),
 * so it works correctly when installed globally or run from any directory.
 *
 * @param configPath - Explicit path to config file (from --config flag)
 * @returns Validated configuration object with Zod defaults applied
 * @throws ConfigError if explicit config file missing or invalid
 */
export function loadConfig(configPath?: string): Config {
  const path = configPath ?? resolve(process.cwd(), 'config.json');

  // If no explicit path and default doesn't exist, return full defaults
  if (!configPath && !existsSync(path)) {
    return ConfigSchema.parse({});
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new ConfigError(
      `Cannot read config file at ${path}: ${(err as Error).message}`,
      'Check the --config path exists and is valid JSON'
    );
  }
  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new ConfigError(
      `Invalid config.json:\n${result.error.format()}`,
      'Check config.json fields match the expected schema'
    );
  }
  return result.data;
}
