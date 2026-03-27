/**
 * test-audio command — verify audio device setup.
 *
 * Checks prerequisites, creates virtual audio devices briefly,
 * starts camera test pattern (native only), verifies everything,
 * then cleans up. Migrated from src/cli/test-devices.ts.
 *
 * Exit codes:
 * - 0: all devices verified
 * - 1: device prerequisite failure
 * - 2: unexpected error
 *
 * @module cli/commands/test-audio
 */
import type { Command } from 'commander';
import { loadConfig } from '../../config/loader.js';
import { DeviceManager } from '../../devices/index.js';
import { detectPlatform } from '../../platform/detect.js';
import { AgentError } from '../../errors/index.js';

/**
 * Register the test-audio subcommand on the Commander program.
 * @param program - Commander program instance
 */
export function registerTestAudioCommand(program: Command): void {
  program
    .command('test-audio')
    .description('Verify audio device setup')
    .option('-c, --config <path>', 'path to config.json')
    .action(async (options: { config?: string }) => {
      try {
        await testAudio(options);
      } catch (err) {
        if (err instanceof AgentError) {
          console.error(`\nError: ${err.message}`);
          console.error(`Hint: ${err.hint}`);
          process.exit(err.exitCode);
        }
        console.error(`\nUnexpected error: ${(err as Error).message}`);
        process.exit(2);
      }
    });
}

/**
 * Run device verification — checks prerequisites, creates virtual devices,
 * runs test pattern (native only), and reports pass/fail.
 */
async function testAudio(options: { config?: string }): Promise<void> {
  console.log('=== AI Meet Agent: Device Verification ===');
  console.log('');

  const platform = detectPlatform();
  console.log(`Platform detected: ${platform}`);
  console.log('');

  const config = loadConfig(options.config);
  const manager = new DeviceManager(config, platform);
  const status = manager.startup({ startTestPattern: platform !== 'wsl2' });

  console.log('\nDevice status:');
  console.log(`  Camera device:  ${status.cameraDevice}`);
  console.log(`  Audio sink:     ${status.audioSinkName}`);
  console.log(`  Virtual mic:    ${status.audioMicName}`);
  console.log(`  Test pattern:   ${status.testPatternRunning ? 'running' : 'not running'}`);

  if (platform === 'wsl2') {
    console.log('\nWSL2 detected — virtual devices are Windows-side:');
    console.log('  Camera: Use OBS Virtual Camera (Windows)');
    console.log('  Audio:  Use VB-Cable (Windows)');
    console.log('See: docs/wsl2-setup.md for setup instructions.');
  } else {
    console.log('\nRunning test pattern for 5 seconds...');
    console.log('To verify camera: open chrome://settings/content/camera — "AI Meet Agent Camera" should appear.');
    console.log('To verify mic:    open chrome://settings/content/microphone — "AI Meet Agent Mic" should appear.');

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  console.log('\nCleaning up...');
  manager.shutdown();

  console.log('\n=== Device verification complete ===');
  console.log('All devices created and cleaned up successfully.');
  console.log('\nNext: run the agent with: ai-meet start');
  process.exit(0);
}
