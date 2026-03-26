import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { downsample24to16, createDownsampleStream } from './audio-converter.js';

describe('downsample24to16', () => {
  it('converts 24kHz buffer to 16kHz with correct length ratio (2/3)', () => {
    // Create a 24kHz buffer with 24 samples (48 bytes)
    const inputSamples = 24;
    const input = Buffer.alloc(inputSamples * 2);
    // Fill with a simple ramp pattern
    for (let i = 0; i < inputSamples; i++) {
      input.writeInt16LE(i * 100, i * 2);
    }

    const output = downsample24to16(input);

    // Output should have floor(24 * 2/3) = 16 samples = 32 bytes
    assert.equal(output.length, 16 * 2);
  });

  it('handles empty buffer', () => {
    const output = downsample24to16(Buffer.alloc(0));
    assert.equal(output.length, 0);
  });

  it('preserves PCM format (16-bit signed LE)', () => {
    // Create buffer with known values
    const inputSamples = 6;
    const input = Buffer.alloc(inputSamples * 2);
    input.writeInt16LE(0, 0);      // sample 0
    input.writeInt16LE(3000, 2);   // sample 1
    input.writeInt16LE(6000, 4);   // sample 2
    input.writeInt16LE(9000, 6);   // sample 3
    input.writeInt16LE(12000, 8);  // sample 4
    input.writeInt16LE(15000, 10); // sample 5

    const output = downsample24to16(input);
    // Should have floor(6 * 2/3) = 4 samples
    assert.equal(output.length, 4 * 2);

    // Each sample should be a valid Int16LE value
    for (let i = 0; i < 4; i++) {
      const val = output.readInt16LE(i * 2);
      assert.ok(val >= -32768 && val <= 32767, `Sample ${i} value ${val} out of Int16 range`);
    }

    // First sample should be 0 (position 0 * 1.5 = 0, which is sample 0)
    assert.equal(output.readInt16LE(0), 0);
  });
});

describe('createDownsampleStream', () => {
  it('returns a Transform that downsamples streamed data', async () => {
    const stream = createDownsampleStream();
    const chunks: Buffer[] = [];

    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    // Write two chunks of 24 samples each (48 bytes each)
    const input1 = Buffer.alloc(48);
    const input2 = Buffer.alloc(48);
    for (let i = 0; i < 24; i++) {
      input1.writeInt16LE(i * 100, i * 2);
      input2.writeInt16LE((i + 24) * 100, i * 2);
    }

    stream.write(input1);
    stream.write(input2);
    stream.end();

    await new Promise<void>((resolve) => stream.on('end', resolve));

    // Each 48-byte chunk (24 samples) should produce 32-byte output (16 samples)
    const totalBytes = chunks.reduce((sum, c) => sum + c.length, 0);
    assert.equal(totalBytes, 32 + 32);
  });
});
