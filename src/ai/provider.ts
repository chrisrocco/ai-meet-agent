import { EventEmitter } from 'events';

/**
 * Provider state — generic state type for any realtime audio provider.
 * Mirrors GeminiSessionState values but is provider-agnostic.
 */
export type ProviderState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/**
 * Generic interface for a realtime audio AI provider.
 *
 * Shaped around what the consumer (src/index.ts) needs, not what any
 * specific AI service provides. Any provider (Gemini, OpenAI, mock)
 * can be swapped in by implementing this interface.
 *
 * Events:
 * - 'audio' (Buffer) — 16kHz PCM audio from AI response
 * - 'text' (string) — AI response text/transcription
 * - 'connected' () — provider connected to AI service
 * - 'disconnected' () — provider disconnected
 * - 'error' (Error) — fatal error
 * - 'latency' (number) — round-trip latency in ms
 */
export interface RealtimeAudioProvider extends EventEmitter {
  /** Connect to the AI service. */
  connect(): Promise<void>;

  /** Send a 16kHz PCM audio chunk to the AI service. */
  sendAudio(pcm16k: Buffer): void;

  /** Disconnect from the AI service. */
  disconnect(): Promise<void>;

  /** Get current connection state. */
  getState(): ProviderState;
}

/**
 * Mock implementation of RealtimeAudioProvider for testing.
 *
 * Records sent audio chunks and provides helper methods to simulate
 * incoming events (audio, text, error, latency) without connecting
 * to any AI service.
 *
 * @example
 * ```typescript
 * const mock = new MockProvider();
 * await mock.connect();
 * mock.sendAudio(Buffer.from([1, 2, 3]));
 * assert.equal(mock.sentChunks.length, 1);
 *
 * mock.simulateAudio(Buffer.from([4, 5, 6]));
 * // Listeners on 'audio' event receive the buffer
 * ```
 */
export class MockProvider extends EventEmitter implements RealtimeAudioProvider {
  private state: ProviderState = 'disconnected';

  /** All audio chunks sent via sendAudio(), for test assertions. */
  readonly sentChunks: Buffer[] = [];

  async connect(): Promise<void> {
    this.state = 'connected';
    this.emit('connected');
  }

  sendAudio(pcm16k: Buffer): void {
    this.sentChunks.push(pcm16k);
  }

  async disconnect(): Promise<void> {
    this.state = 'disconnected';
    this.emit('disconnected');
  }

  getState(): ProviderState {
    return this.state;
  }

  /** Simulate receiving audio from the AI service. */
  simulateAudio(pcm: Buffer): void {
    this.emit('audio', pcm);
  }

  /** Simulate receiving text/transcription from the AI service. */
  simulateText(text: string): void {
    this.emit('text', text);
  }

  /** Simulate an error from the AI service. */
  simulateError(err: Error): void {
    this.emit('error', err);
  }

  /** Simulate a latency measurement. */
  simulateLatency(ms: number): void {
    this.emit('latency', ms);
  }
}
