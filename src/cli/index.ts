/**
 * AI Meet Agent CLI — Commander.js program definition.
 *
 * Registers all subcommands (start, list-devices, test-audio) and
 * provides version/help output. Entry point is bin/ai-meet.ts.
 *
 * @module cli
 */
import { Command } from 'commander';
import { createRequire } from 'module';
import { registerStartCommand } from './commands/start.js';
import { registerListDevicesCommand } from './commands/list-devices.js';
import { registerTestAudioCommand } from './commands/test-audio.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string; description: string };

export const program = new Command();

program
  .name('ai-meet')
  .description('AI meeting twin — bidirectional realtime audio through Google Meet')
  .version(pkg.version, '-v, --version');

// Register all command handlers
registerStartCommand(program);
registerListDevicesCommand(program);
registerTestAudioCommand(program);

/**
 * Parse argv and run the matched command.
 * @param argv - Process arguments (defaults to process.argv)
 */
export function run(argv: string[] = process.argv): void {
  program.parse(argv);
}
