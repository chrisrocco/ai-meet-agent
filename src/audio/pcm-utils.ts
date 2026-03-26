/**
 * PCM audio utility functions for s16le format.
 * s16le = signed 16-bit little-endian, 2 bytes per sample.
 */

/**
 * Compute the RMS (Root Mean Square) level of a PCM buffer.
 * Assumes s16le format (signed 16-bit little-endian).
 *
 * @param pcmBuffer - Buffer containing s16le PCM samples
 * @returns RMS value as a raw sample amplitude (0 to ~32768)
 */
export function computeRms(pcmBuffer: Buffer): number {
  const bytesPerSample = 2;
  const sampleCount = Math.floor(pcmBuffer.length / bytesPerSample);
  if (sampleCount === 0) return 0;

  let sumSquares = 0;
  for (let i = 0; i < sampleCount * bytesPerSample; i += bytesPerSample) {
    const sample = pcmBuffer.readInt16LE(i);
    sumSquares += sample * sample;
  }

  return Math.sqrt(sumSquares / sampleCount);
}

/**
 * Compute the RMS level normalized to 0-1 range.
 * Divides by 32768 (max absolute value of int16).
 *
 * @param pcmBuffer - Buffer containing s16le PCM samples
 * @returns Normalized RMS value (0.0 to 1.0)
 */
export function computeRmsNormalized(pcmBuffer: Buffer): number {
  return computeRms(pcmBuffer) / 32768;
}
