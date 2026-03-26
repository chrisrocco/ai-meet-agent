import { spawn as defaultSpawn, execSync, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as http from 'http';
import type { IncomingMessage, ServerResponse } from 'http';
import type { VideoFeed } from './types.js';

/** Spawn function signature for dependency injection in tests. */
export type SpawnFunction = typeof defaultSpawn;

const BOUNDARY = 'mjpegboundary';

/**
 * WSL2 video feed: spawns ffmpeg.exe on Windows via powershell.exe and serves
 * the MJPEG output over HTTP as a multipart stream.
 *
 * Uses a broadcast pattern so multiple HTTP clients can consume the stream
 * simultaneously (e.g. browser tab + OBS Virtual Camera).
 *
 * Architecture:
 *   powershell.exe → ffmpeg.exe → stdout (MJPEG frames)
 *                                      ↓
 *                            HTTP multipart/x-mixed-replace
 *                                      ↓
 *                              HTTP clients (Set)
 */
export class Wsl2VideoFeed extends EventEmitter implements VideoFeed {
  private proc: ChildProcess | null = null;
  private stopped = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private server: http.Server | null = null;
  private readonly clients = new Set<ServerResponse>();
  private readonly port: number;
  private imagePath = '';
  private readonly spawnFn: SpawnFunction;

  constructor(port = 8085, spawnFn?: SpawnFunction) {
    super();
    this.port = port;
    this.spawnFn = spawnFn ?? defaultSpawn;
  }

  /** Start the HTTP MJPEG server and spawn ffmpeg.exe via powershell.exe. */
  start(imagePath: string): void {
    this.stopped = false;
    this.imagePath = imagePath;
    this.startHttpServer();
    this.spawnFfmpeg();
  }

  /** Stop ffmpeg, close HTTP server, prevent auto-restart. */
  stop(): void {
    this.stopped = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.killProc();
    this.stopHttpServer();
  }

  private startHttpServer(): void {
    this.server = http.createServer((_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, {
        'Content-Type': `multipart/x-mixed-replace;boundary=${BOUNDARY}`,
        'Cache-Control': 'no-cache',
        'Connection': 'close',
      });
      this.clients.add(res);
      res.on('close', () => {
        this.clients.delete(res);
      });
      res.on('error', () => {
        this.clients.delete(res);
      });
    });

    this.server.listen(this.port, '0.0.0.0', () => {
      console.log(`[video/wsl2] MJPEG HTTP server listening on http://0.0.0.0:${this.port}`);
    });

    this.server.on('error', (err) => {
      this.emit('error', err);
    });
  }

  private spawnFfmpeg(): void {
    // Convert WSL path to Windows path for ffmpeg.exe
    let winPath: string;
    try {
      winPath = execSync(`wslpath -w "${this.imagePath}"`).toString().trim();
    } catch (err) {
      this.emit('error', new Error(`wslpath failed: ${err}`));
      return;
    }

    // Escape backslashes for PowerShell string
    const escapedPath = winPath.replace(/\\/g, '\\\\');

    const psCommand = [
      `ffmpeg.exe`,
      `-loop 1`,
      `-re`,
      `-i "${escapedPath}"`,
      `-vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1"`,
      `-f image2pipe`,
      `-vcodec mjpeg`,
      `-r 15`,
      `pipe:1`,
    ].join(' ');

    this.proc = this.spawnFn('powershell.exe', ['-Command', psCommand], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Buffer incoming JPEG frames and broadcast to all HTTP clients
    let frameBuffer = Buffer.alloc(0);

    this.proc.stdout!.on('data', (chunk: Buffer) => {
      frameBuffer = Buffer.concat([frameBuffer, chunk]);

      // JPEG frames start with FF D8 and end with FF D9
      // Extract complete frames and broadcast each one
      let start = 0;
      while (start < frameBuffer.length - 1) {
        // Find next JPEG SOI marker
        const soiIdx = frameBuffer.indexOf(Buffer.from([0xFF, 0xD8]), start);
        if (soiIdx === -1) break;

        // Find JPEG EOI marker after SOI
        const eoiIdx = frameBuffer.indexOf(Buffer.from([0xFF, 0xD9]), soiIdx + 2);
        if (eoiIdx === -1) {
          // Incomplete frame — keep buffered from SOI onward
          frameBuffer = frameBuffer.subarray(soiIdx);
          break;
        }

        const frame = frameBuffer.subarray(soiIdx, eoiIdx + 2);
        this.broadcastFrame(frame);
        start = eoiIdx + 2;
      }

      // Discard consumed data
      if (start >= frameBuffer.length) {
        frameBuffer = Buffer.alloc(0);
      } else if (start > 0) {
        frameBuffer = frameBuffer.subarray(start);
      }
    });

    this.proc.stderr!.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) {
        process.stderr.write(`[ffmpeg.exe/video] ${msg}\n`);
      }
    });

    this.proc.on('error', (err) => {
      this.emit('error', err);
    });

    this.proc.on('exit', (code, signal) => {
      if (!this.stopped) {
        console.warn(`[ffmpeg.exe/video] Exited with code=${code} signal=${signal}, restarting...`);
        this.emit('restarting');
        this.restartTimer = setTimeout(() => {
          this.spawnFfmpeg();
        }, 1000);
      }
    });
  }

  private broadcastFrame(frame: Buffer): void {
    if (this.clients.size === 0) return;

    const header = Buffer.from(
      `--${BOUNDARY}\r\n` +
      `Content-Type: image/jpeg\r\n` +
      `Content-Length: ${frame.length}\r\n` +
      `\r\n`
    );

    for (const res of this.clients) {
      try {
        res.write(header);
        res.write(frame);
        res.write(Buffer.from('\r\n'));
      } catch {
        this.clients.delete(res);
      }
    }
  }

  private killProc(): void {
    if (this.proc && this.proc.pid != null) {
      const pid = this.proc.pid;
      // Kill the Windows process tree via taskkill
      try {
        this.spawnFn('powershell.exe', ['-Command', `taskkill /F /T /PID ${pid}`], {
          stdio: 'ignore',
        });
      } catch {
        // Best-effort
      }
      try {
        this.proc.kill('SIGTERM');
      } catch {
        // Already exited
      }
      this.proc = null;
    }
  }

  private stopHttpServer(): void {
    // Close all active client connections
    for (const res of this.clients) {
      try {
        res.end();
      } catch {
        // Already closed
      }
    }
    this.clients.clear();

    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
