import { type Socket } from 'net';

/** Default port for the WSL2 audio relay TCP server. */
export const RELAY_PORT = 19876;

/** Message types in the relay protocol. */
export const MESSAGE_TYPE = {
  CAPTURE: 1,
  OUTPUT: 2,
} as const;

/**
 * Write a length-prefixed frame to a TCP socket.
 * Frame format: [4-byte LE uint32 length][payload bytes]
 */
export function writeFrame(socket: Socket, payload: Buffer): void {
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length);
  socket.write(header);
  socket.write(payload);
}

/**
 * Accumulates TCP data and extracts complete length-prefixed frames.
 * Handles partial reads and multi-frame chunks correctly.
 */
export class FrameReader {
  private buffer = Buffer.alloc(0);

  /**
   * Feed incoming TCP data and extract any complete frames.
   * @param data - Raw TCP data received
   * @returns Array of complete frame payloads (may be empty)
   */
  feed(data: Buffer): Buffer[] {
    this.buffer = Buffer.concat([this.buffer, data]);
    const frames: Buffer[] = [];

    while (this.buffer.length >= 4) {
      const payloadLen = this.buffer.readUInt32LE(0);
      const totalFrameLen = 4 + payloadLen;

      if (this.buffer.length < totalFrameLen) {
        break; // Incomplete frame, wait for more data
      }

      frames.push(Buffer.from(this.buffer.subarray(4, totalFrameLen)));
      this.buffer = Buffer.from(this.buffer.subarray(totalFrameLen));
    }

    return frames;
  }

  /** Reset the internal buffer. */
  reset(): void {
    this.buffer = Buffer.alloc(0);
  }
}
