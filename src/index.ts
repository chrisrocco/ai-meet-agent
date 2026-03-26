/**
 * AI Meet Agent — Main entry point
 * Starts virtual devices, registers shutdown handlers, and runs until Ctrl+C.
 * Future phases will wire in audio pipeline and AI session here.
 */
import { loadConfig } from './config/loader.js';
import { DeviceManager } from './devices/index.js';
import { detectPlatform } from './platform/detect.js';

async function main(): Promise<void> {
  console.log('=== AI Meet Agent ===');
  console.log('');

  const platform = detectPlatform();
  console.log(`Platform: ${platform}`);

  const config = loadConfig();
  console.log(`Camera: ${config.devices.camera.label} (/dev/video${config.devices.camera.videoNr})`);
  console.log(`Mic:    ${config.devices.mic.label}`);
  console.log('');

  const manager = new DeviceManager(config);
  manager.registerShutdownHandlers();

  let status;
  try {
    status = manager.startup({ startTestPattern: false });
  } catch (err) {
    console.error(`\n[FATAL] ${(err as Error).message}`);
    console.error('Run "bash scripts/setup.sh" to install prerequisites.');
    process.exit(1);
  }

  console.log('\n[DeviceManager] Devices ready:');
  console.log(`  Camera: ${status.cameraDevice}`);
  console.log(`  Sink:   ${status.audioSinkName}`);
  console.log(`  Mic:    ${status.audioMicName}`);
  console.log('\nPress Ctrl+C to stop and clean up devices.');

  // Keep alive — future phases add audio pipeline and AI session here
  await new Promise<void>(() => { /* blocked until SIGINT/SIGTERM */ });
}

main().catch((err) => {
  console.error(`Fatal: ${(err as Error).message}`);
  process.exit(2);
});
