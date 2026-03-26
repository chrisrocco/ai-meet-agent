import { connect, type Socket } from 'net';
import { EventEmitter } from 'events';
import { PassThrough, type Writable } from 'stream';
import { type AudioOutput } from './types.js';
import { FrameReader, writeFrame, RELAY_PORT } from './wsl2-relay.js';
import { computeRmsNormalized } from './pcm-utils.js';

/**
 * WSL2 audio output via TCP relay to Windows.
 * Connects to the Windows-side relay server and sends PCM frames.
 */
export class Wsl2AudioOutput extends EventEmitter implements AudioOutput {
  private socket: Socket | null = null;
  private writable: PassThrough | null = null;

  constructor(
    private readonly sinkName: string,
    private readonly port = RELAY_PORT,
  ) {
    super();
  }

  /**
   * Connect to the relay and start sending audio.
   * Returns a Writable stream — write PCM data to it.
   */
  start(): Writable {
    this.socket = connect(this.port, '127.0.0.1');

    this.socket.on('connect', () => {
      // Send handshake identifying this as an output connection
      const handshake = Buffer.from(JSON.stringify({
        type: 'output',
        sink: this.sinkName,
      }));
      writeFrame(this.socket!, handshake);
    });

    this.socket.on('error', (err) => {
      this.emit('error', err);
    });

    // Create a PassThrough that intercepts writes and sends them as framed TCP
    this.writable = new PassThrough();
    this.writable.on('data', (chunk: Buffer) => {
      if (this.socket && !this.socket.destroyed) {
        writeFrame(this.socket, chunk);
      }
      const rms = computeRmsNormalized(chunk);
      this.emit('level', rms);
    });

    return this.writable;
  }

  /** Stop output and disconnect from relay. */
  stop(): void {
    if (this.writable) {
      this.writable.end();
      this.writable = null;
    }
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }
}
