/**
 * AI Meet Agent — Legacy entry point.
 *
 * Redirects to CLI. Use `ai-meet start` or `npx ai-meet start` instead.
 * Preserved for backward compatibility with `npm run dev`.
 */
import { run } from './cli/index.js';

run(['node', 'ai-meet', 'start', ...process.argv.slice(2)]);
