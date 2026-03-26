/**
 * AI Meet Agent — Main entry point
 * Starts virtual devices, audio pipeline, registers shutdown handlers, and runs until Ctrl+C.
 * Future phases add AI session and conversation logic here.
 */
import { loadConfig } from './config/loader.js';
import { DeviceManager } from './devices/index.js';
import { detectPlatform } from './platform/detect.js';
import { createAudioCapture, createAudioOutput } from './audio/index.js';
import type { AudioCapture, AudioOutput } from './audio/index.js';
import { createVideoFeed, DEFAULT_PLACEHOLDER_PATH } from './video/index.js';
import type { VideoFeed } from './video/index.js';

async function main(): Promise<void> {
  console.log('=== AI Meet Agent ===');
  console.log('');

  const platform = detectPlatform();
  console.log(`Platform: ${platform}`);

  const config = loadConfig();

  if (platform !== 'wsl2') {
    console.log(`Camera: ${config.devices.camera.label} (/dev/video${config.devices.camera.videoNr})`);
    console.log(`Mic:    ${config.devices.mic.label}`);
  }
  console.log('');

  const manager = new DeviceManager(config, platform);

  let status;
  try {
    status = manager.startup({ startTestPattern: false });
  } catch (err) {
    console.error(`\n[FATAL] ${(err as Error).message}`);
    console.error('Run "bash scripts/setup.sh" to install prerequisites.');
    process.exit(1);
  }

  if (platform === 'wsl2') {
    console.log('\nWSL2 bridge mode — devices managed on Windows side.');
    console.log('See docs/wsl2-setup.md for configuration.');
  } else {
    console.log('\n[DeviceManager] Devices ready:');
    console.log(`  Camera: ${status.cameraDevice}`);
    console.log(`  Sink:   ${status.audioSinkName}`);
    console.log(`  Mic:    ${status.audioMicName}`);
  }

  // Start audio pipeline
  let capture: AudioCapture | null = null;
  let output: AudioOutput | null = null;

  try {
    capture = createAudioCapture(status.audioSinkName, platform);
    output = createAudioOutput(status.audioMicName, platform);

    const captureStream = capture.start();
    output.start();

    // Log RMS levels for visibility ("audio is flowing")
    capture.on('level', (rms: number) => {
      if (rms > 0.01) console.log(`[Capture] Audio level: ${(rms * 100).toFixed(1)}%`);
    });
    output.on('level', (rms: number) => {
      if (rms > 0.01) console.log(`[Output] Audio level: ${(rms * 100).toFixed(1)}%`);
    });

    capture.on('reconnecting', () => console.log('[Capture] Reconnecting...'));
    capture.on('error', (err: Error) => {
      console.warn(`[Capture] Error: ${err.message}`);
    });
    output.on('error', (err: Error) => {
      console.warn(`[Output] Error: ${err.message}`);
    });

    // Consume capture stream (discard for now — Phase 4 connects to AI API)
    captureStream.on('data', () => { /* Phase 4 pipes this to Gemini Live API */ });

    console.log('\n[AudioPipeline] Capture and output streams started.');
  } catch (err) {
    console.warn(`[AudioPipeline] Could not start audio: ${(err as Error).message}`);
    console.warn('[AudioPipeline] Audio pipeline will not be active this session.');
  }

  // Start video feed
  let videoFeed: VideoFeed | null = null;

  try {
    videoFeed = createVideoFeed(config.devices.camera.videoNr, config.video.mjpegPort, platform);
    const imagePath = config.devices.camera.imagePath ?? DEFAULT_PLACEHOLDER_PATH;
    videoFeed.start(imagePath);

    videoFeed.on('restarting', () => console.log('[VideoFeed] Restarting...'));
    videoFeed.on('error', (err: Error) => {
      console.warn(`[VideoFeed] Error: ${err.message}`);
    });

    if (platform === 'wsl2') {
      console.log(`\n[VideoFeed] MJPEG stream at http://localhost:${config.video.mjpegPort}/feed`);
      console.log('[VideoFeed] Configure OBS Media Source — see docs/wsl2-video-setup.md');
    } else {
      console.log(`\n[VideoFeed] Static image streaming to /dev/video${config.devices.camera.videoNr}`);
    }
  } catch (err) {
    console.warn(`[VideoFeed] Could not start: ${(err as Error).message}`);
    console.warn('[VideoFeed] Video feed will not be active this session.');
  }

  console.log('\nPress Ctrl+C to stop and clean up.');

  // Shutdown handler: stop audio first, then devices
  const shutdown = () => {
    console.log('\n[Shutdown] Cleaning up...');
    if (capture) {
      try { capture.stop(); } catch { /* ignore */ }
    }
    if (output) {
      try { output.stop(); } catch { /* ignore */ }
    }
    if (videoFeed) {
      try { videoFeed.stop(); } catch { /* ignore */ }
    }
    manager.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep alive — blocked until SIGINT/SIGTERM
  await new Promise<void>(() => {});
}

main().catch((err) => {
  console.error(`Fatal: ${(err as Error).message}`);
  process.exit(2);
});
