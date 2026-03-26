import { spawn as defaultSpawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import type { VideoFeed } from './types.js';

/** Spawn function signature for dependency injection in tests. */
export type SpawnFunction = typeof defaultSpawn;

/**
 * Native Linux video feed using ffmpeg to stream a static image to a v4l2 loopback device.
 * Auto-restarts if ffmpeg exits unexpectedly.
 * Uses a detached process group so stop() can kill all descendant processes.
 */
export class NativeVideoFeed extends EventEmitter implements VideoFeed {
  private proc: ChildProcess | null = null;
  private stopped = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly devicePath: string;
  private imagePath = '';
  private readonly spawnFn: SpawnFunction;

  constructor(
    videoNr: number,
    spawnFn?: SpawnFunction,
  ) {
    super();
    this.devicePath = `/dev/video${videoNr}`;
    this.spawnFn = spawnFn ?? defaultSpawn;
  }

  /** Start streaming the static image to the v4l2 device. */
  start(imagePath: string): void {
    this.stopped = false;
    this.imagePath = imagePath;
    this.spawnFfmpeg();
  }

  /** Stop streaming, kill the process group, prevent auto-restart. */
  stop(): void {
    this.stopped = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.killProc();
  }

  private spawnFfmpeg(): void {
    this.proc = this.spawnFn('ffmpeg', [
      '-loop', '1',
      '-re',
      '-i', this.imagePath,
      '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1',
      '-pix_fmt', 'yuv420p',
      '-f', 'v4l2',
      '-r', '15',
      this.devicePath,
    ], {
      stdio: ['ignore', 'ignore', 'pipe'],
      detached: true,
    });

    this.proc.stderr!.on('data', (data: Buffer) => {
      // ffmpeg logs to stderr normally; only log at debug level
      const msg = data.toString().trim();
      if (msg) {
        process.stderr.write(`[ffmpeg/video] ${msg}\n`);
      }
    });

    this.proc.on('error', (err) => {
      this.emit('error', err);
    });

    this.proc.on('exit', (code, signal) => {
      if (!this.stopped) {
        console.warn(`[ffmpeg/video] Exited with code=${code} signal=${signal}, restarting...`);
        this.emit('restarting');
        this.restartTimer = setTimeout(() => {
          this.spawnFfmpeg();
        }, 1000);
      }
    });
  }

  private killProc(): void {
    if (this.proc && this.proc.pid != null) {
      try {
        // Kill the entire process group (detached: true creates a new group)
        process.kill(-this.proc.pid, 'SIGTERM');
      } catch {
        // Process may have already exited
      }
      this.proc = null;
    }
  }
}
