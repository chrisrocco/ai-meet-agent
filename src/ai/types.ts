/**
 * AI module types for Gemini Live API integration.
 */

/** Gemini Live WebSocket session states. */
export type GeminiSessionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/** Events emitted by GeminiLiveSession. */
export interface GeminiSessionEvents {
  audio: (pcm16k: Buffer) => void;
  text: (text: string) => void;
  connected: () => void;
  disconnected: () => void;
  error: (err: Error) => void;
  latency: (ms: number) => void;
}

/** Configuration for creating a GeminiLiveSession. */
export interface GeminiSessionConfig {
  apiKey: string;
  model: string;
  systemPrompt: string;
  onAudio: (pcm16k: Buffer) => void;
}

/** Latency statistics for AI audio round-trips. */
export interface LatencyStats {
  lastMs: number;
  avgMs: number;
  maxMs: number;
  count: number;
  overThresholdCount: number;
}

/**
 * Gemini Live API output audio sample rate.
 * Input is 16kHz (matches AUDIO_FORMAT), output is 24kHz.
 */
export const GEMINI_OUTPUT_SAMPLE_RATE = 24000;
