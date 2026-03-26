import { spawn as defaultSpawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { type Readable } from 'stream';
import { AUDIO_FORMAT, type AudioCapture } from './types.js';
import { computeRmsNormalized } from './pcm-utils.js';

/** Spawn function signature for dependency injection in tests. */
export type SpawnFunction = typeof defaultSpawn;

/**
 * Native Linux audio capture using parec (PulseAudio).
 * Spawns parec to record from a sink monitor and pipes stdout as a Readable stream.
 * Auto-reconnects if the subprocess dies unexpectedly.
 */
export class NativeAudioCapture extends EventEmitter implements AudioCapture {
  private proc: ChildProcess | null = null;
  private stopped = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private levelAccumulator = Buffer.alloc(0);
  private readonly spawnFn: SpawnFunction;

  /** Bytes between RMS level events (~250ms at 32KB/s = 8000 bytes) */
  private readonly levelIntervalBytes = AUDIO_FORMAT.sampleRate * (AUDIO_FORMAT.bitDepth / 8) * AUDIO_FORMAT.channels / 4;

  constructor(
    private readonly sinkName: string,
    private readonly format = AUDIO_FORMAT,
    spawnFn?: SpawnFunction,
  ) {
    super();
    this.spawnFn = spawnFn ?? defaultSpawn;
  }

  /**
   * Start capturing audio from the sink monitor.
   * Returns a Readable stream of raw PCM data (s16le).
   */
  start(): Readable {
    this.stopped = false;
    this.spawnParec();
    return this.proc!.stdout!;
  }

  /** Stop capture, kill subprocess, prevent auto-reconnect. */
  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.killProc();
  }

  private spawnParec(): void {
    const device = `${this.sinkName}.monitor`;
    this.proc = this.spawnFn('parec', [
      '--device', device,
      '--format', this.format.encoding,
      '--rate', String(this.format.sampleRate),
      '--channels', String(this.format.channels),
      '--latency-msec', '20',
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.proc.stdout!.on('data', (chunk: Buffer) => {
      this.accumulateLevel(chunk);
    });

    this.proc.stderr!.on('data', (data: Buffer) => {
      console.error(`[parec] ${data.toString().trim()}`);
    });

    this.proc.on('error', (err) => {
      this.emit('error', err);
    });

    this.proc.on('exit', (code, signal) => {
      if (!this.stopped) {
        console.warn(`[parec] Exited with code=${code} signal=${signal}, reconnecting...`);
        this.emit('reconnecting');
        this.reconnectTimer = setTimeout(() => {
          this.spawnParec();
        }, 1000);
      }
    });
  }

  private accumulateLevel(chunk: Buffer): void {
    this.levelAccumulator = Buffer.concat([this.levelAccumulator, chunk]);
    while (this.levelAccumulator.length >= this.levelIntervalBytes) {
      const segment = this.levelAccumulator.subarray(0, this.levelIntervalBytes);
      this.levelAccumulator = this.levelAccumulator.subarray(this.levelIntervalBytes);
      const rms = computeRmsNormalized(segment);
      this.emit('level', rms);
    }
  }

  private killProc(): void {
    if (this.proc) {
      this.proc.kill('SIGTERM');
      this.proc = null;
    }
  }
}
