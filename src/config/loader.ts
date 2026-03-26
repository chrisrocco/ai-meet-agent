import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { ConfigSchema, type Config } from './schema.js';

// Walk up from src/config/ to find project root config.json
const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), '../../..');

export function loadConfig(configPath?: string): Config {
  const path = configPath ?? resolve(PROJECT_ROOT, 'config.json');
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
