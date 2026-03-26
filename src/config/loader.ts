import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { ConfigSchema, type Config } from './schema.js';

// Walk up from src/config/ to find project root config.json
const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), '../../..');

/**
 * Parse CLI arguments for --config and --meeting flags.
 * @param argv - process.argv array
 * @returns Parsed CLI arguments
 */
export function parseCliArgs(argv: string[]): { configPath?: string; meetingPath?: string } {
  const args: { configPath?: string; meetingPath?: string } = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--config' && argv[i + 1]) {
      args.configPath = argv[++i];
    } else if (argv[i] === '--meeting' && argv[i + 1]) {
      args.meetingPath = argv[++i];
    }
  }
  return args;
}

/**
 * Load and validate configuration.
 * - If configPath provided, reads that file (throws on missing/invalid).
 * - If no configPath, tries PROJECT_ROOT/config.json.
 * - If default config.json doesn't exist, returns full Zod defaults.
 */
export function loadConfig(configPath?: string): Config {
  const path = configPath ?? resolve(PROJECT_ROOT, 'config.json');

  // If no explicit path and default doesn't exist, return full defaults
  if (!configPath && !existsSync(path)) {
    return ConfigSchema.parse({});
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`Cannot read config file at ${path}: ${(err as Error).message}\nCreate a config.json in the project root.`);
  }
  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid config.json:\n${result.error.format()}`);
  }
  return result.data;
}
