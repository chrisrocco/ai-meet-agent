import { describe, it } from 'node:test';
import assert from 'node:assert';
import { computeRms, computeRmsNormalized } from './pcm-utils.js';

describe('computeRms', () => {
  it('returns 0 for silence (all-zero buffer)', () => {
    const silence = Buffer.alloc(320); // 160 samples of s16le zeros
    assert.strictEqual(computeRms(silence), 0);
  });

  it('returns 0 for empty buffer', () => {
    const empty = Buffer.alloc(0);
    assert.strictEqual(computeRms(empty), 0);
  });

  it('returns max amplitude for constant max-value buffer', () => {
    // 10 samples of int16 max value (32767)
    const buf = Buffer.alloc(20);
    for (let i = 0; i < 10; i++) {
      buf.writeInt16LE(32767, i * 2);
    }
    assert.strictEqual(computeRms(buf), 32767);
  });

  it('returns correct RMS for known sine-like samples', () => {
    // For a sine wave: RMS = peak / sqrt(2) ≈ 0.7071 * peak
    // Use samples: [10000, -10000, 10000, -10000]
    // RMS = sqrt((10000^2 + 10000^2 + 10000^2 + 10000^2) / 4) = 10000
    const buf = Buffer.alloc(8);
    buf.writeInt16LE(10000, 0);
    buf.writeInt16LE(-10000, 2);
    buf.writeInt16LE(10000, 4);
    buf.writeInt16LE(-10000, 6);
    assert.strictEqual(computeRms(buf), 10000);
  });

  it('handles known mixed amplitude samples', () => {
    // Samples: [100, 200, 300]
    // RMS = sqrt((10000 + 40000 + 90000) / 3) = sqrt(46666.67) ≈ 216.02
    const buf = Buffer.alloc(6);
    buf.writeInt16LE(100, 0);
    buf.writeInt16LE(200, 2);
    buf.writeInt16LE(300, 4);
    const rms = computeRms(buf);
    assert.ok(Math.abs(rms - 216.02) < 1, `Expected ~216.02, got ${rms}`);
  });

  it('handles odd-length buffer (trailing byte ignored)', () => {
    // 3 bytes = 1 complete sample + 1 trailing byte
    const buf = Buffer.alloc(3);
    buf.writeInt16LE(1000, 0);
    buf[2] = 0xFF; // trailing byte, should be ignored
    assert.strictEqual(computeRms(buf), 1000);
  });

  it('handles negative samples correctly', () => {
    // All samples at -32768 (min int16)
    const buf = Buffer.alloc(4);
    buf.writeInt16LE(-32768, 0);
    buf.writeInt16LE(-32768, 2);
    assert.strictEqual(computeRms(buf), 32768);
  });
});

describe('computeRmsNormalized', () => {
  it('returns 0 for silence', () => {
    const silence = Buffer.alloc(320);
    assert.strictEqual(computeRmsNormalized(silence), 0);
  });

  it('returns approximately 1.0 for max amplitude', () => {
    const buf = Buffer.alloc(20);
    for (let i = 0; i < 10; i++) {
      buf.writeInt16LE(32767, i * 2);
    }
    const normalized = computeRmsNormalized(buf);
    // 32767 / 32768 ≈ 0.99997
    assert.ok(normalized > 0.99 && normalized <= 1.0,
      `Expected ~1.0, got ${normalized}`);
  });

  it('returns value in 0-1 range for moderate amplitude', () => {
    const buf = Buffer.alloc(4);
    buf.writeInt16LE(16384, 0); // half max
    buf.writeInt16LE(16384, 2);
    const normalized = computeRmsNormalized(buf);
    assert.ok(normalized > 0.4 && normalized < 0.6,
      `Expected ~0.5, got ${normalized}`);
  });
});
