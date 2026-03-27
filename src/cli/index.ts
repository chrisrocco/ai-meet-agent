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

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string; description: string };

export const program = new Command();

program
  .name('ai-meet')
  .description('AI meeting twin — bidirectional realtime audio through Google Meet')
  .version(pkg.version, '-v, --version');

// start subcommand — stub until plan 08-03 wires the real handler
program
  .command('start')
  .description('Launch a meeting session')
  .option('-c, --config <path>', 'path to config.json')
  .option('-n, --notes <path>', 'path to meeting notes markdown file')
  .option('-r, --role <path>', 'path to persona/role file')
  .option('--verbose', 'enable verbose logging')
  .action(async () => {
    console.error('start command not yet wired — see plan 08-03');
    process.exit(1);
  });

// list-devices subcommand — stub until plan 08-02 wires the real handler
program
  .command('list-devices')
  .description('List available audio/video devices')
  .option('-c, --config <path>', 'path to config.json')
  .action(async () => {
    console.error('list-devices command not yet wired — see plan 08-02');
    process.exit(1);
  });

// test-audio subcommand — stub until plan 08-02 wires the real handler
program
  .command('test-audio')
  .description('Verify audio device setup')
  .option('-c, --config <path>', 'path to config.json')
  .action(async () => {
    console.error('test-audio command not yet wired — see plan 08-02');
    process.exit(1);
  });

/**
 * Parse argv and run the matched command.
 * @param argv - Process arguments (defaults to process.argv)
 */
export function run(argv: string[] = process.argv): void {
  program.parse(argv);
}
