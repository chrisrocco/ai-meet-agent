#!/usr/bin/env tsx
/**
 * AI Meet Agent CLI entry point.
 * Uses tsx shebang for direct TypeScript execution.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env from cwd if present (Node 22+)
const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

import { run } from '../src/cli/index.js';

run();
