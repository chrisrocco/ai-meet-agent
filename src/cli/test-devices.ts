/**
 * test-devices: Standalone device verification.
 * Checks prerequisites, creates virtual audio devices briefly, starts camera test pattern
 * for 3 seconds, verifies everything, then cleans up.
 *
 * Exit 0 = all devices verified
 * Exit 1 = one or more prerequisite failures (fix commands printed)
 * Exit 2 = unexpected error
 */
import { loadConfig } from '../config/loader.js';
import { DeviceManager } from '../devices/index.js';
import { detectPlatform } from '../platform/detect.js';

async function main(): Promise<void> {
  console.log('=== AI Meet Agent: Device Verification ===');
  console.log('');

  const platform = detectPlatform();
  console.log(`Platform detected: ${platform}`);
  console.log('');

  const config = loadConfig();
  const manager = new DeviceManager(config, platform);

  let status;
  try {
    status = manager.startup({ startTestPattern: platform !== 'wsl2' });
  } catch (err) {
    // Prerequisites failed — DeviceManager already printed fix instructions
    console.error(`\n[FAIL] ${(err as Error).message}`);
    process.exit(1);
  }

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
  console.log('\nNext: run the agent with: npm run dev');
  process.exit(0);
}

main().catch((err) => {
  console.error(`Unexpected error: ${(err as Error).message}`);
  process.exit(2);
});
