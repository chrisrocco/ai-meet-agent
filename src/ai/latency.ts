import { EventEmitter } from 'events';
import type { LatencyStats } from './types.js';

/**
 * Tracks round-trip latency between audio send and AI response receive.
 * Emits 'warning' when latency exceeds threshold.
 * Provides periodic console summary.
 */
export class LatencyTracker extends EventEmitter {
  private measurements: number[] = [];
  private pendingSendTime: number | null = null;
  private summaryTimer: ReturnType<typeof setInterval> | null = null;
  private readonly thresholdMs: number;
  private readonly summaryIntervalMs: number;

  constructor(thresholdMs: number = 2000, summaryIntervalMs: number = 30000) {
    super();
    this.thresholdMs = thresholdMs;
    this.summaryIntervalMs = summaryIntervalMs;
  }

  /** Mark the time when an audio chunk is sent to the API. */
  markSent(): void {
    this.pendingSendTime = Date.now();
  }

  /** Mark the time when the first AI response byte arrives. */
  markReceived(): void {
    if (this.pendingSendTime === null) return;

    const deltaMs = Date.now() - this.pendingSendTime;
    this.measurements.push(deltaMs);
    this.pendingSendTime = null;

    this.emit('latency', deltaMs);

    if (deltaMs > this.thresholdMs) {
      console.warn(`[AI Latency] High latency: ${deltaMs}ms (threshold: ${this.thresholdMs}ms)`);
      this.emit('warning', deltaMs);
    }
  }

  /** Get current latency statistics. */
  getStats(): LatencyStats {
    if (this.measurements.length === 0) {
      return { lastMs: 0, avgMs: 0, maxMs: 0, count: 0, overThresholdCount: 0 };
    }

    const count = this.measurements.length;
    const lastMs = this.measurements[count - 1];
    const maxMs = Math.max(...this.measurements);
    const avgMs = Math.round(this.measurements.reduce((a, b) => a + b, 0) / count);
    const overThresholdCount = this.measurements.filter(m => m > this.thresholdMs).length;

    return { lastMs, avgMs, maxMs, count, overThresholdCount };
  }

  /** Start periodic console summary of latency stats. */
  startSummaryTimer(): void {
    this.stopSummaryTimer();
    this.summaryTimer = setInterval(() => {
      const stats = this.getStats();
      if (stats.count > 0) {
        console.log(
          `[AI Latency] avg=${stats.avgMs}ms max=${stats.maxMs}ms count=${stats.count} over-2s=${stats.overThresholdCount}`
        );
      }
    }, this.summaryIntervalMs);
    // Don't keep process alive just for summary timer
    this.summaryTimer.unref();
  }

  /** Stop the periodic summary timer. */
  stopSummaryTimer(): void {
    if (this.summaryTimer) {
      clearInterval(this.summaryTimer);
      this.summaryTimer = null;
    }
  }

  /** Reset all measurements. */
  reset(): void {
    this.measurements = [];
    this.pendingSendTime = null;
  }
}
