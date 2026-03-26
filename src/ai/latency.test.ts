import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { LatencyTracker } from './latency.js';

describe('LatencyTracker', () => {
  let tracker: LatencyTracker;

  beforeEach(() => {
    tracker = new LatencyTracker(2000, 30000);
  });

  it('markSent + markReceived records a round-trip measurement', () => {
    tracker.markSent();
    // Simulate some passage of time
    tracker.markReceived();
    const stats = tracker.getStats();
    assert.equal(stats.count, 1);
    assert.ok(stats.lastMs >= 0);
  });

  it('returns correct avg, max, count after multiple measurements', () => {
    // Manually inject measurements for deterministic testing
    (tracker as any).measurements = [100, 200, 300];
    const stats = tracker.getStats();
    assert.equal(stats.count, 3);
    assert.equal(stats.lastMs, 300);
    assert.equal(stats.avgMs, 200);
    assert.equal(stats.maxMs, 300);
  });

  it('overThresholdCount increments when latency > 2000ms', () => {
    (tracker as any).measurements = [100, 2500, 200, 3000];
    const stats = tracker.getStats();
    assert.equal(stats.overThresholdCount, 2);
  });

  it('reset clears all stats', () => {
    (tracker as any).measurements = [100, 200];
    tracker.reset();
    const stats = tracker.getStats();
    assert.equal(stats.count, 0);
    assert.equal(stats.lastMs, 0);
    assert.equal(stats.avgMs, 0);
    assert.equal(stats.maxMs, 0);
  });

  it('emits warning event when latency exceeds threshold', () => {
    let warned = false;
    tracker.on('warning', (ms: number) => {
      warned = true;
      assert.ok(ms > 2000);
    });

    // Manually simulate a high-latency measurement
    (tracker as any).pendingSendTime = Date.now() - 2500;
    tracker.markReceived();

    assert.ok(warned, 'Expected warning event to be emitted');
  });

  it('returns zero stats when no measurements', () => {
    const stats = tracker.getStats();
    assert.equal(stats.count, 0);
    assert.equal(stats.lastMs, 0);
    assert.equal(stats.avgMs, 0);
    assert.equal(stats.maxMs, 0);
    assert.equal(stats.overThresholdCount, 0);
  });
});
