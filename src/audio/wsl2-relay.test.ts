import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PassThrough } from 'stream';
import { FrameReader, writeFrame } from './wsl2-relay.js';

describe('writeFrame', () => {
  it('produces [4-byte LE uint32 length][payload] buffer', () => {
    const socket = new PassThrough();
    const chunks: Buffer[] = [];
    socket.on('data', (chunk: Buffer) => chunks.push(chunk));

    const payload = Buffer.from('hello');
    writeFrame(socket as any, payload);

    const combined = Buffer.concat(chunks);
    assert.strictEqual(combined.length, 4 + 5); // 4-byte header + 5-byte payload
    assert.strictEqual(combined.readUInt32LE(0), 5); // length = 5
    assert.deepStrictEqual(combined.subarray(4), payload);
  });

  it('handles empty payload', () => {
    const socket = new PassThrough();
    const chunks: Buffer[] = [];
    socket.on('data', (chunk: Buffer) => chunks.push(chunk));

    writeFrame(socket as any, Buffer.alloc(0));

    const combined = Buffer.concat(chunks);
    assert.strictEqual(combined.length, 4);
    assert.strictEqual(combined.readUInt32LE(0), 0);
  });
});

describe('FrameReader', () => {
  it('extracts a complete frame from one chunk', () => {
    const reader = new FrameReader();
    const payload = Buffer.from('test data');
    const header = Buffer.alloc(4);
    header.writeUInt32LE(payload.length);

    const frames = reader.feed(Buffer.concat([header, payload]));
    assert.strictEqual(frames.length, 1);
    assert.deepStrictEqual(frames[0], payload);
  });

  it('returns empty array for partial data', () => {
    const reader = new FrameReader();
    // Only send 2 bytes of a 4-byte header
    const frames = reader.feed(Buffer.alloc(2));
    assert.strictEqual(frames.length, 0);
  });

  it('completes frame after subsequent feed', () => {
    const reader = new FrameReader();
    const payload = Buffer.from('hello world');
    const header = Buffer.alloc(4);
    header.writeUInt32LE(payload.length);
    const full = Buffer.concat([header, payload]);

    // Split in the middle of the payload
    const part1 = full.subarray(0, 6);
    const part2 = full.subarray(6);

    assert.strictEqual(reader.feed(part1).length, 0);
    const frames = reader.feed(part2);
    assert.strictEqual(frames.length, 1);
    assert.deepStrictEqual(frames[0], payload);
  });

  it('extracts multiple frames from one chunk', () => {
    const reader = new FrameReader();

    const payload1 = Buffer.from('aaa');
    const header1 = Buffer.alloc(4);
    header1.writeUInt32LE(payload1.length);

    const payload2 = Buffer.from('bbb');
    const header2 = Buffer.alloc(4);
    header2.writeUInt32LE(payload2.length);

    const combined = Buffer.concat([header1, payload1, header2, payload2]);
    const frames = reader.feed(combined);

    assert.strictEqual(frames.length, 2);
    assert.deepStrictEqual(frames[0], payload1);
    assert.deepStrictEqual(frames[1], payload2);
  });

  it('handles frame split across boundary', () => {
    const reader = new FrameReader();

    const payload = Buffer.from('cross-boundary');
    const header = Buffer.alloc(4);
    header.writeUInt32LE(payload.length);
    const full = Buffer.concat([header, payload]);

    // Split right at header/payload boundary
    const part1 = full.subarray(0, 4); // just the header
    const part2 = full.subarray(4);     // just the payload

    assert.strictEqual(reader.feed(part1).length, 0);
    const frames = reader.feed(part2);
    assert.strictEqual(frames.length, 1);
    assert.deepStrictEqual(frames[0], payload);
  });

  it('round-trips with writeFrame preserving exact PCM data', () => {
    const reader = new FrameReader();
    const socket = new PassThrough();

    // Simulate PCM data
    const pcmData = Buffer.alloc(320);
    for (let i = 0; i < 160; i++) {
      pcmData.writeInt16LE(Math.floor(Math.random() * 65536) - 32768, i * 2);
    }

    // Write frame to socket
    writeFrame(socket as any, pcmData);

    // Read from socket and feed to FrameReader
    const received = socket.read() as Buffer;
    const frames = reader.feed(received);

    assert.strictEqual(frames.length, 1);
    assert.deepStrictEqual(frames[0], pcmData);
  });

  it('handles large payloads', () => {
    const reader = new FrameReader();
    const payload = Buffer.alloc(64 * 1024); // 64KB
    payload.fill(0x42);
    const header = Buffer.alloc(4);
    header.writeUInt32LE(payload.length);

    const frames = reader.feed(Buffer.concat([header, payload]));
    assert.strictEqual(frames.length, 1);
    assert.strictEqual(frames[0].length, 64 * 1024);
    assert.strictEqual(frames[0][0], 0x42);
  });
});
