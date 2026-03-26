import { spawn as defaultSpawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { type Writable } from 'stream';
import { AUDIO_FORMAT, type AudioOutput } from './types.js';
import { computeRmsNormalized } from './pcm-utils.js';

/** Spawn function signature for dependency injection in tests. */
export type SpawnFunction = typeof defaultSpawn;

/**
 * Native Linux audio output using pacat (PulseAudio).
 * Spawns pacat to write PCM to a sink via stdin.
 */
export class NativeAudioOutput extends EventEmitter implements AudioOutput {
  private proc: ChildProcess | null = null;
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
   * Start the output subprocess.
   * Returns a Writable stream — write PCM data to it.
   */
  start(): Writable {
    this.proc = this.spawnFn('pacat', [
      '--device', this.sinkName,
      '--format', this.format.encoding,
      '--rate', String(this.format.sampleRate),
      '--channels', String(this.format.channels),
      '--latency-msec', '20',
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.proc.stderr!.on('data', (data: Buffer) => {
      console.error(`[pacat] ${data.toString().trim()}`);
    });

    this.proc.on('error', (err) => {
      this.emit('error', err);
    });

    // Wrap stdin to emit level events when data is written
    const stdin = this.proc.stdin!;
    const originalWrite = stdin.write.bind(stdin);
    const self = this;

    stdin.write = function (
      chunk: unknown,
      encodingOrCallback?: BufferEncoding | ((error: Error | null | undefined) => void),
      callback?: (error: Error | null | undefined) => void,
    ): boolean {
      if (Buffer.isBuffer(chunk)) {
        self.accumulateLevel(chunk);
      }
      if (typeof encodingOrCallback === 'function') {
        return originalWrite(chunk as Uint8Array, encodingOrCallback);
      }
      if (encodingOrCallback !== undefined) {
        return originalWrite(chunk as Uint8Array, encodingOrCallback, callback);
      }
      return originalWrite(chunk as Uint8Array);
    } as typeof stdin.write;

    return this.proc.stdin!;
  }

  /** Stop the output subprocess gracefully. */
  stop(): void {
    if (this.proc) {
      try {
        this.proc.stdin!.end();
      } catch {
        // stdin may already be destroyed
      }
      this.proc.kill('SIGTERM');
      this.proc = null;
    }
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
}
