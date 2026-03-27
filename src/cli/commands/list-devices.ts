/**
 * list-devices command — show available audio/video devices.
 *
 * Native Linux: queries PulseAudio (pactl) and v4l2-ctl for real device lists.
 * WSL2: echoes configured Windows device names from config.json wsl2 section.
 *
 * @module cli/commands/list-devices
 */
import type { Command } from 'commander';
import { execSync } from 'child_process';
import { loadConfig } from '../../config/loader.js';
import { detectPlatform } from '../../platform/detect.js';
import { AgentError } from '../../errors/index.js';

/**
 * Register the list-devices subcommand on the Commander program.
 * @param program - Commander program instance
 */
export function registerListDevicesCommand(program: Command): void {
  program
    .command('list-devices')
    .description('List available audio/video devices')
    .option('-c, --config <path>', 'path to config.json')
    .action(async (options: { config?: string }) => {
      try {
        await listDevices(options);
      } catch (err) {
        if (err instanceof AgentError) {
          console.error(`Error: ${err.message}`);
          console.error(`Hint: ${err.hint}`);
          process.exit(err.exitCode);
        }
        console.error(`Unexpected error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}

/**
 * List available audio and video devices.
 *
 * On native Linux, queries system tools (pactl, v4l2-ctl).
 * On WSL2, displays configured Windows device names from config.
 */
async function listDevices(options: { config?: string }): Promise<void> {
  const platform = detectPlatform();
  const config = loadConfig(options.config);

  console.log(`Config: ${options.config ?? 'defaults'}`);
  console.log(`Platform: ${platform}`);
  console.log('');

  if (platform === 'wsl2') {
    console.log('WSL2 detected — showing configured Windows devices:');
    console.log('');

    console.log('Audio Input Devices:');
    console.log(`  ${config.wsl2.captureDevice}`);
    console.log('');

    console.log('Audio Output Devices:');
    console.log(`  ${config.wsl2.outputDevice}`);
    console.log('');

    console.log('Video Devices:');
    console.log('  OBS Virtual Camera (configure on Windows)');
    console.log('');

    console.log('To change devices, edit config.json wsl2 section.');
  } else {
    // Native Linux — query system tools
    console.log('Audio Input Devices:');
    try {
      const sources = execSync('pactl list sources short 2>/dev/null', { encoding: 'utf8' });
      const lines = sources.trim().split('\n').filter((l: string) => l.length > 0);
      for (const line of lines) {
        const parts = line.split('\t');
        console.log(`  ${parts[1] ?? line}`);
      }
    } catch {
      console.log('  (pactl not available — install PulseAudio/PipeWire)');
    }
    console.log('');

    console.log('Audio Output Devices:');
    try {
      const sinks = execSync('pactl list sinks short 2>/dev/null', { encoding: 'utf8' });
      const lines = sinks.trim().split('\n').filter((l: string) => l.length > 0);
      for (const line of lines) {
        const parts = line.split('\t');
        console.log(`  ${parts[1] ?? line}`);
      }
    } catch {
      console.log('  (pactl not available — install PulseAudio/PipeWire)');
    }
    console.log('');

    console.log('Video Devices:');
    try {
      const video = execSync('v4l2-ctl --list-devices 2>/dev/null', { encoding: 'utf8' });
      const lines = video.trim().split('\n');
      for (const line of lines) {
        console.log(`  ${line}`);
      }
    } catch {
      console.log('  (v4l2-ctl not available — install v4l-utils)');
    }
  }
}
