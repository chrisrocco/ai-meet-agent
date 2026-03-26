import { Transform } from 'stream';

/**
 * Downsample 24kHz 16-bit signed LE mono PCM to 16kHz using linear interpolation.
 * Ratio: 3:2 (every 3 input samples produce 2 output samples).
 */
export function downsample24to16(input: Buffer): Buffer {
  const bytesPerSample = 2; // 16-bit
  const inputSamples = input.length / bytesPerSample;

  if (inputSamples === 0) {
    return Buffer.alloc(0);
  }

  const outputSamples = Math.floor(inputSamples * 2 / 3);
  const output = Buffer.alloc(outputSamples * bytesPerSample);

  for (let i = 0; i < outputSamples; i++) {
    // Source position in 24kHz stream for this 16kHz output sample
    const srcPos = i * 1.5;
    const srcIdx = Math.floor(srcPos);
    const frac = srcPos - srcIdx;

    const s0 = input.readInt16LE(srcIdx * bytesPerSample);
    const s1 = srcIdx + 1 < inputSamples
      ? input.readInt16LE((srcIdx + 1) * bytesPerSample)
      : s0;

    // Linear interpolation
    const interpolated = Math.round(s0 + frac * (s1 - s0));
    // Clamp to Int16 range
    const clamped = Math.max(-32768, Math.min(32767, interpolated));
    output.writeInt16LE(clamped, i * bytesPerSample);
  }

  return output;
}

/**
 * Create a Transform stream that downsamples 24kHz PCM to 16kHz.
 * Each chunk is independently downsampled.
 */
export function createDownsampleStream(): Transform {
  return new Transform({
    transform(chunk: Buffer, _encoding: string, callback) {
      try {
        const downsampled = downsample24to16(chunk);
        callback(null, downsampled);
      } catch (err) {
        callback(err as Error);
      }
    },
  });
}
