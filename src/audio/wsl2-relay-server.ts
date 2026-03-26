import { createServer, type Server, type Socket } from 'net';
import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { FrameReader, writeFrame, RELAY_PORT } from './wsl2-relay.js';
import type { Config } from '../config/schema.js';

/**
 * WSL2 Audio Relay Server — TCP relay + Windows bridge lifecycle.
 *
 * Accepts capture and output client connections using the length-prefixed
 * framing protocol from wsl2-relay.ts. Spawns ffmpeg.exe (capture) and
 * ffplay.exe (output) via WSL2 interop to bridge audio between
 * VB-Cable on Windows and the Node.js audio pipeline.
 */
export class WslAudioRelayServer extends EventEmitter {
  private server: Server | null = null;
  private captureClient: Socket | null = null;
  private outputClient: Socket | null = null;
  private captureProc: ChildProcess | null = null;
  private outputProc: ChildProcess | null = null;
  private outputReader: FrameReader | null = null;
  private stopped = false;
  private captureRestartTimer: ReturnType<typeof setTimeout> | null = null;
  private outputRestartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly config: Config) {
    super();
  }

  /** Start the TCP server and spawn bridge processes. */
  async start(): Promise<void> {
    await this.startTcpServer();
    console.log(`[AudioRelay] TCP relay listening on port ${this.config.audio.relayPort ?? RELAY_PORT}`);
    this.spawnCaptureBridge();
    this.spawnOutputBridge();
  }

  /** Stop everything: bridges, clients, server. */
  stop(): void {
    this.stopped = true;

    if (this.captureRestartTimer) {
      clearTimeout(this.captureRestartTimer);
      this.captureRestartTimer = null;
    }
    if (this.outputRestartTimer) {
      clearTimeout(this.outputRestartTimer);
      this.outputRestartTimer = null;
    }

    if (this.captureClient) {
      this.captureClient.destroy();
      this.captureClient = null;
    }
    if (this.outputClient) {
      this.outputClient.destroy();
      this.outputClient = null;
    }
    this.outputReader = null;

    this.killBridge(this.captureProc);
    this.captureProc = null;
    this.killBridge(this.outputProc);
    this.outputProc = null;

    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  // ---------------------------------------------------------------------------
  // TCP Server
  // ---------------------------------------------------------------------------

  private startTcpServer(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const port = this.config.audio.relayPort ?? RELAY_PORT;
      this.server = createServer({ noDelay: true }, (socket) => {
        this.handleConnection(socket);
      });

      this.server.once('error', (err) => {
        reject(err);
      });

      this.server.listen(port, '127.0.0.1', () => {
        resolve();
      });
    });
  }

  private handleConnection(socket: Socket): void {
    socket.setNoDelay(true);

    const handshakeReader = new FrameReader();

    const onData = (data: Buffer): void => {
      const frames = handshakeReader.feed(data);
      if (frames.length === 0) return;

      // First complete frame is the handshake
      socket.removeListener('data', onData);

      let handshake: { type: string; sink?: string };
      try {
        handshake = JSON.parse(frames[0].toString());
      } catch {
        console.warn('[AudioRelay] Invalid handshake, closing socket');
        socket.destroy();
        return;
      }

      if (handshake.type === 'capture') {
        this.setupCaptureClient(socket);
      } else if (handshake.type === 'output') {
        this.setupOutputClient(socket);
      } else {
        console.warn(`[AudioRelay] Unknown handshake type: ${handshake.type}`);
        socket.destroy();
      }
    };

    socket.on('data', onData);

    socket.on('error', (err) => {
      console.warn(`[AudioRelay] Socket error during handshake: ${err.message}`);
      socket.destroy();
    });
  }

  private setupCaptureClient(socket: Socket): void {
    if (this.captureClient) {
      this.captureClient.destroy();
    }
    this.captureClient = socket;
    console.log('[AudioRelay] Capture client connected');

    socket.on('close', () => {
      if (this.captureClient === socket) {
        this.captureClient = null;
        console.log('[AudioRelay] Capture client disconnected');
      }
    });

    socket.on('error', (err) => {
      console.warn(`[AudioRelay] Capture client error: ${err.message}`);
      socket.destroy();
    });
  }

  private setupOutputClient(socket: Socket): void {
    if (this.outputClient) {
      this.outputClient.destroy();
    }
    this.outputClient = socket;
    this.outputReader = new FrameReader();
    console.log('[AudioRelay] Output client connected');

    socket.on('data', (data: Buffer) => {
      if (!this.outputReader) return;
      const frames = this.outputReader.feed(data);
      for (const frame of frames) {
        // Write raw PCM payload to ffplay stdin (strip framing)
        if (this.outputProc && this.outputProc.stdin && !this.outputProc.stdin.destroyed) {
          this.outputProc.stdin.write(frame);
        }
      }
    });

    socket.on('close', () => {
      if (this.outputClient === socket) {
        this.outputClient = null;
        this.outputReader = null;
        console.log('[AudioRelay] Output client disconnected');
      }
    });

    socket.on('error', (err) => {
      console.warn(`[AudioRelay] Output client error: ${err.message}`);
      socket.destroy();
    });
  }

  // ---------------------------------------------------------------------------
  // Bridge Processes
  // ---------------------------------------------------------------------------

  private spawnCaptureBridge(): void {
    const args = [
      '-f', 'dshow',
      '-audio_buffer_size', '50',
      '-i', `audio=${this.config.wsl2.captureDevice}`,
      '-f', 's16le',
      '-ar', '16000',
      '-ac', '1',
      'pipe:1',
    ];

    this.captureProc = spawn(this.config.wsl2.ffmpegPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    this.captureProc.stdout!.on('data', (pcm: Buffer) => {
      // Bridge outputs RAW PCM — wrap in length-prefixed frames for TCP client
      if (this.captureClient && !this.captureClient.destroyed) {
        writeFrame(this.captureClient, pcm);
      }
    });

    this.captureProc.stderr!.on('data', (data: Buffer) => {
      console.log(`[AudioRelay:capture] ${data.toString().split('\n')[0]}`);
    });

    this.captureProc.on('exit', (code, signal) => {
      if (!this.stopped) {
        console.warn(`[AudioRelay:capture] Bridge exited (code=${code} signal=${signal}), restarting...`);
        this.captureRestartTimer = setTimeout(() => this.spawnCaptureBridge(), 1000);
      }
    });

    this.captureProc.on('error', (err) => {
      console.warn(`[AudioRelay:capture] Bridge error: ${err.message}`);
    });
  }

  private spawnOutputBridge(): void {
    const args = [
      '-f', 's16le',
      '-ar', '16000',
      '-ac', '1',
      '-nodisp',
      '-autoexit',
    ];

    // Only add -audio_device_index if non-default (> 0)
    if (this.config.wsl2.outputDeviceIndex > 0) {
      args.push('-audio_device_index', String(this.config.wsl2.outputDeviceIndex));
    }

    args.push('-i', 'pipe:0');

    this.outputProc = spawn(this.config.wsl2.ffplayPath, args, {
      stdio: ['pipe', 'ignore', 'pipe'],
      env: process.env,
    });

    this.outputProc.stderr!.on('data', (data: Buffer) => {
      console.log(`[AudioRelay:output] ${data.toString().split('\n')[0]}`);
    });

    this.outputProc.on('exit', (code, signal) => {
      if (!this.stopped) {
        console.warn(`[AudioRelay:output] Bridge exited (code=${code} signal=${signal}), restarting...`);
        this.outputRestartTimer = setTimeout(() => this.spawnOutputBridge(), 1000);
      }
    });

    this.outputProc.on('error', (err) => {
      console.warn(`[AudioRelay:output] Bridge error: ${err.message}`);
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private killBridge(proc: ChildProcess | null): void {
    if (!proc || proc.killed) return;

    // Kill Windows process tree via taskkill (WSL2 interop)
    if (proc.pid != null) {
      try {
        spawn('powershell.exe', ['-Command', `taskkill /F /T /PID ${proc.pid}`]);
      } catch {
        // taskkill may fail if process already exited
      }
    }

    // Fallback: SIGTERM the WSL2-side wrapper
    try {
      proc.kill('SIGTERM');
    } catch {
      // Process may have already exited
    }
  }
}
