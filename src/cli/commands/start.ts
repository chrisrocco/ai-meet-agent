/**
 * start command — launch a full meeting session.
 *
 * Migrated from src/index.ts main(). Initializes virtual devices,
 * audio pipeline, AI provider, operator monitor, transcript, and
 * video feed. Accepts --config, --notes, --role, --verbose flags.
 *
 * Uses GeminiProvider (not GeminiLiveSession directly) for the
 * AI session, per the RealtimeAudioProvider interface.
 *
 * @module cli/commands/start
 */
import type { Command } from 'commander';
import { loadConfig } from '../../config/loader.js';
import { loadRole } from '../../config/role-loader.js';
import { loadMeetingContext } from '../../meeting/loader.js';
import { DeviceManager } from '../../devices/index.js';
import { detectPlatform } from '../../platform/detect.js';
import { createAudioCapture, createAudioOutput } from '../../audio/index.js';
import type { AudioCapture, AudioOutput } from '../../audio/index.js';
import { WslAudioRelayServer } from '../../audio/wsl2-relay-server.js';
import { createVideoFeed, DEFAULT_PLACEHOLDER_PATH } from '../../video/index.js';
import type { VideoFeed } from '../../video/index.js';
import { GeminiProvider } from '../../ai/index.js';
import { buildSystemPrompt } from '../../ai/index.js';
import { TranscriptWriter } from '../../transcript/writer.js';
import { OperatorAudioMonitor } from '../../monitor/operator-audio.js';
import { AgentError, AISessionError, AudioPipelineError } from '../../errors/index.js';

/**
 * Options for the start command, parsed by Commander.
 */
interface StartOptions {
  config?: string;
  notes?: string;
  role?: string;
  verbose?: boolean;
}

/**
 * Register the start subcommand on the Commander program.
 * @param program - Commander program instance
 */
export function registerStartCommand(program: Command): void {
  program
    .command('start')
    .description('Launch a meeting session')
    .option('-c, --config <path>', 'path to config.json')
    .option('-n, --notes <path>', 'path to meeting notes markdown file')
    .option('-r, --role <path>', 'path to persona/role file')
    .option('--verbose', 'enable verbose logging')
    .action(async (options: StartOptions) => {
      try {
        await startSession(options);
      } catch (err) {
        if (err instanceof AgentError) {
          console.error(`\nError: ${err.message}`);
          console.error(`Hint: ${err.hint}`);
          process.exit(err.exitCode);
        }
        console.error(`\nUnexpected error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}

/**
 * Start a full meeting session.
 *
 * Startup sequence:
 * 1. Platform detection
 * 2. Config loading (with --config path)
 * 3. Role loading (with --role path, merged into persona)
 * 4. Meeting notes loading (with --notes path)
 * 5. Transcript writer init
 * 6. DeviceManager startup
 * 7. WSL2 relay server (if wsl2)
 * 8. Audio capture + output (CRITICAL)
 * 9. AI provider connect (CRITICAL)
 * 10. Operator monitor (non-fatal)
 * 11. Wire audio streams
 * 12. Video feed (non-fatal)
 * 13. Startup banner + keep-alive
 *
 * @throws AISessionError if GEMINI_API_KEY not set or AI connection fails
 * @throws AudioPipelineError if audio pipeline cannot start
 * @throws DeviceError if device prerequisites not met
 * @throws ConfigError if config/role file invalid
 */
async function startSession(options: StartOptions): Promise<void> {
  console.log('=== AI Meet Agent ===');
  console.log('');

  const platform = detectPlatform();
  console.log(`Platform: ${platform}`);

  // Load config (--config path or cwd default)
  const config = loadConfig(options.config);

  // Load role override (--role path)
  if (options.role) {
    const roleOverride = loadRole(options.role);
    Object.assign(config.persona, roleOverride);
    console.log(`[Role] Loaded from: ${options.role}`);
  }

  if (platform !== 'wsl2') {
    console.log(`Camera: ${config.devices.camera.label} (/dev/video${config.devices.camera.videoNr})`);
    console.log(`Mic:    ${config.devices.mic.label}`);
  }
  console.log('');

  // Load meeting notes (--notes path)
  let meetingContext: string | undefined;
  if (options.notes) {
    meetingContext = loadMeetingContext(options.notes);
    console.log(`[Meeting] Loaded context from: ${options.notes}`);
  }

  // Initialize transcript writer
  const transcript = new TranscriptWriter('./transcript.log');
  console.log('[Transcript] Writing to ./transcript.log');

  const manager = new DeviceManager(config, platform);
  const status = manager.startup({ startTestPattern: false });

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

    // Log RMS levels (verbose only)
    if (options.verbose) {
      capture.on('level', (rms: number) => {
        if (rms > 0.01) console.log(`[Capture] Audio level: ${(rms * 100).toFixed(1)}%`);
      });
      output.on('level', (rms: number) => {
        if (rms > 0.01) console.log(`[Output] Audio level: ${(rms * 100).toFixed(1)}%`);
      });
    }

    capture.on('reconnecting', () => console.log('[Capture] Reconnecting...'));
    capture.on('error', (err: Error) => {
      console.warn(`[Capture] Error: ${err.message}`);
    });
    output.on('error', (err: Error) => {
      console.warn(`[Output] Error: ${err.message}`);
    });

    console.log('\n[AudioPipeline] Capture and output streams started.');
  } catch (err) {
    throw new AudioPipelineError(
      `Audio pipeline failed: ${(err as Error).message}`,
      'Audio is required for AI conversation. Check PulseAudio/PipeWire setup.'
    );
  }

  // AI Session — CRITICAL PATH (must succeed)
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new AISessionError(
      'GEMINI_API_KEY environment variable not set',
      'Export GEMINI_API_KEY=your-key or add to .env file'
    );
  }

  const systemPrompt = buildSystemPrompt(config.persona, meetingContext);
  const provider = new GeminiProvider({
    apiKey,
    model: config.ai.model,
    systemPrompt,
    maxRetries: 5,
  });

  // Provider event logging
  provider.on('connected', () => {
    console.log('[AI] Connected to Gemini Live API');
    console.log(`[AI] Persona: ${config.persona.name} (${config.persona.role})`);
  });
  provider.on('disconnected', () => console.log('[AI] Disconnected'));
  provider.on('error', (err: Error) => {
    console.error(`[AI] Error: ${err.message}`);
  });
  provider.on('latency', (ms: number) => {
    if (ms > 2000) {
      console.warn(`[AI] High latency: ${ms}ms (threshold: 2000ms)`);
    }
  });

  // Wire transcript to AI text events
  provider.on('text', (text: string) => {
    transcript.writeAI(config.persona.name, text);
  });

  // Start AI connection — CRITICAL PATH
  console.log(`\n[AI] Session configured: ${config.ai.model}`);
  console.log(`[AI] Persona: ${config.persona.name} (${config.persona.role})`);
  try {
    await provider.connect();
  } catch (err) {
    throw new AISessionError(
      `AI session failed: ${(err as Error).message}`,
      'Check GEMINI_API_KEY and network connection'
    );
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

  // Wire audio: participant audio -> AI + monitor, AI audio -> virtual mic + monitor
  captureStream!.on('data', (chunk: Buffer) => {
    provider.sendAudio(chunk);
    monitor.write(chunk);
  });

  provider.on('audio', (pcm16k: Buffer) => {
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
  if (meetingContext) console.log(`Meeting:    ${options.notes}`);
  console.log(`Transcript: ./transcript.log`);
  console.log(`Monitor:    Active (operator hears both sides)`);
  console.log('\nPress Ctrl+C to stop.');

  // Shutdown handler: AI provider first, then monitor, audio, relay, video, devices
  const shutdown = () => {
    console.log('\n[Shutdown] Cleaning up...');
    try { provider.disconnect(); } catch { /* ignore */ }
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
