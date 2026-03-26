import { connect, type Socket } from 'net';
import { EventEmitter } from 'events';
import { PassThrough, type Readable } from 'stream';
import { type AudioCapture } from './types.js';
import { FrameReader, writeFrame, RELAY_PORT } from './wsl2-relay.js';
import { computeRmsNormalized } from './pcm-utils.js';

/**
 * WSL2 audio capture via TCP relay to Windows.
 * Connects to the Windows-side relay server and receives PCM frames.
 */
export class Wsl2AudioCapture extends EventEmitter implements AudioCapture {
  private socket: Socket | null = null;
  private passthrough: PassThrough | null = null;
  private frameReader = new FrameReader();
  private stopped = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly sinkName: string,
    private readonly port = RELAY_PORT,
  ) {
    super();
  }

  /**
   * Connect to the relay and start receiving audio.
   * Returns a Readable stream of raw PCM data.
   */
  start(): Readable {
    this.stopped = false;
    this.passthrough = new PassThrough();
    this.connectToRelay();
    return this.passthrough;
  }

  /** Stop capture and disconnect from relay. */
  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.disconnect();
  }

  private connectToRelay(): void {
    this.frameReader.reset();
    this.socket = connect(this.port, '127.0.0.1');

    this.socket.on('connect', () => {
      // Send handshake identifying this as a capture connection
      const handshake = Buffer.from(JSON.stringify({
        type: 'capture',
        sink: this.sinkName,
      }));
      writeFrame(this.socket!, handshake);
    });

    this.socket.on('data', (data: Buffer) => {
      const frames = this.frameReader.feed(data);
      for (const frame of frames) {
        if (this.passthrough && !this.passthrough.destroyed) {
          this.passthrough.write(frame);
        }
        const rms = computeRmsNormalized(frame);
        this.emit('level', rms);
      }
    });

    this.socket.on('error', (err) => {
      this.emit('error', err);
    });

    this.socket.on('close', () => {
      if (!this.stopped) {
        console.warn('[Wsl2AudioCapture] Connection lost, reconnecting...');
        this.emit('reconnecting');
        this.reconnectTimer = setTimeout(() => this.connectToRelay(), 1000);
      }
    });
  }

  private disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    if (this.passthrough) {
      this.passthrough.end();
      this.passthrough = null;
    }
  }
}
