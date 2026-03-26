/**
 * AI Meet Agent — Main entry point
 * Single-command startup: npm run start -- --config <path> --meeting <path>
 * Starts virtual devices, audio pipeline, AI session with meeting context,
 * operator audio monitor, transcript logging, and video feed.
 */
import { parseCliArgs, loadConfig } from './config/loader.js';
import { loadMeetingContext } from './meeting/loader.js';
import { DeviceManager } from './devices/index.js';
import { detectPlatform } from './platform/detect.js';
import { createAudioCapture, createAudioOutput } from './audio/index.js';
import type { AudioCapture, AudioOutput } from './audio/index.js';
import { WslAudioRelayServer } from './audio/wsl2-relay-server.js';
import { createVideoFeed, DEFAULT_PLACEHOLDER_PATH } from './video/index.js';
import type { VideoFeed } from './video/index.js';
import { GeminiLiveSession, buildSystemPrompt } from './ai/index.js';
import { TranscriptWriter } from './transcript/writer.js';
import { OperatorAudioMonitor } from './monitor/operator-audio.js';

async function main(): Promise<void> {
  console.log('=== AI Meet Agent ===');
  console.log('');

  // Parse CLI arguments
  const args = parseCliArgs(process.argv);

  const platform = detectPlatform();
  console.log(`Platform: ${platform}`);

  // Load config (returns defaults if no config file exists and no --config flag)
  const config = loadConfig(args.configPath);

  if (platform !== 'wsl2') {
    console.log(`Camera: ${config.devices.camera.label} (/dev/video${config.devices.camera.videoNr})`);
    console.log(`Mic:    ${config.devices.mic.label}`);
  }
  console.log('');

  // Load meeting context (optional)
  let meetingContext: string | undefined;
  if (args.meetingPath) {
    meetingContext = loadMeetingContext(args.meetingPath);
    console.log(`[Meeting] Loaded context from: ${args.meetingPath}`);
  }

  // Initialize transcript writer
  const transcript = new TranscriptWriter('./transcript.log');
  console.log('[Transcript] Writing to ./transcript.log');

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

  // Start WSL2 audio relay (must be before audio pipeline creation)
  let relayServer: WslAudioRelayServer | null = null;
  if (platform === 'wsl2') {
    try {
      relayServer = new WslAudioRelayServer(config);
      await relayServer.start();
    } catch (err) {
      console.warn(`[AudioRelay] Could not start relay: ${(err as Error).message}`);
      console.warn('[AudioRelay] WSL2 audio pipeline will not be active.');
    }
  }

  // Start audio pipeline — CRITICAL PATH (must succeed)
  let capture: AudioCapture | null = null;
  let output: AudioOutput | null = null;
  let outputStream: import('stream').Writable | null = null;
  let captureStream: import('stream').Readable | null = null;

  try {
    capture = createAudioCapture(status.audioSinkName, platform);
    output = createAudioOutput(status.audioMicName, platform);

    captureStream = capture.start();
    outputStream = output.start();

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

    console.log('\n[AudioPipeline] Capture and output streams started.');
  } catch (err) {
    console.error(`\n[FATAL] Audio pipeline failed: ${(err as Error).message}`);
    console.error('[FATAL] Audio is required for AI conversation. Cannot continue.');
    process.exit(1);
  }

  // AI Session — CRITICAL PATH (must succeed)
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('\n[FATAL] GEMINI_API_KEY not set. AI session is required.');
    console.error('[FATAL] Set GEMINI_API_KEY environment variable to enable AI responses.');
    process.exit(1);
  }

  const systemPrompt = buildSystemPrompt(config.persona, meetingContext);
  const session = new GeminiLiveSession({
    apiKey,
    model: config.ai.model,
    systemPrompt,
    maxRetries: 5,
  });

  // Session event logging
  session.on('connected', () => {
    console.log('[AI] Connected to Gemini Live API');
    console.log(`[AI] Persona: ${config.persona.name} (${config.persona.role})`);
  });
  session.on('disconnected', () => console.log('[AI] Disconnected'));
  session.on('error', (err: Error) => {
    console.error(`[AI] Error: ${err.message}`);
  });
  session.on('latency', (ms: number) => {
    if (ms > 2000) {
      console.warn(`[AI] High latency: ${ms}ms (threshold: 2000ms)`);
    }
  });

  // Wire transcript to AI text events
  session.on('text', (text: string) => {
    transcript.writeAI(config.persona.name, text);
  });

  // Start AI connection — CRITICAL PATH
  console.log(`\n[AI] Session configured: ${config.ai.model}`);
  console.log(`[AI] Persona: ${config.persona.name} (${config.persona.role})`);
  try {
    await session.connect();
  } catch (err) {
    console.error(`\n[FATAL] AI session failed: ${(err as Error).message}`);
    console.error('[FATAL] AI session is required for conversation. Cannot continue.');
    process.exit(1);
  }

  // Start operator audio monitor (non-fatal if ffplay unavailable)
  const monitor = new OperatorAudioMonitor();
  try {
    monitor.start(platform, platform === 'wsl2' ? config.wsl2.ffplayPath : undefined);
    console.log('[Monitor] Operator audio monitor active');
  } catch (err) {
    console.warn(`[Monitor] Could not start: ${(err as Error).message}`);
    console.warn('[Monitor] Operator will not hear audio locally.');
  }

  // Wire audio: participant audio → AI + monitor, AI audio → virtual mic + monitor
  captureStream!.on('data', (chunk: Buffer) => {
    session.sendAudio(chunk);
    monitor.write(chunk);
  });

  session.on('audio', (pcm16k: Buffer) => {
    outputStream!.write(pcm16k);
    monitor.write(pcm16k);
  });

  // Start video feed (non-fatal — video failure degrades gracefully)
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

  // Startup banner
  console.log('\n=== System Ready ===');
  console.log(`Platform:   ${platform}`);
  console.log(`Persona:    ${config.persona.name} (${config.persona.role})`);
  if (meetingContext) console.log(`Meeting:    ${args.meetingPath}`);
  console.log(`Transcript: ./transcript.log`);
  console.log(`Monitor:    Active (operator hears both sides)`);
  console.log('\nPress Ctrl+C to stop.');

  // Shutdown handler: AI session first, then monitor, audio, relay, video, devices
  const shutdown = () => {
    console.log('\n[Shutdown] Cleaning up...');
    try { session.disconnect(); } catch { /* ignore */ }
    monitor.stop();
    if (capture) {
      try { capture.stop(); } catch { /* ignore */ }
    }
    if (output) {
      try { output.stop(); } catch { /* ignore */ }
    }
    if (relayServer) {
      try { relayServer.stop(); } catch { /* ignore */ }
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
