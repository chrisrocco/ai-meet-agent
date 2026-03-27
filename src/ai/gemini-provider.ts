import { EventEmitter } from 'events';
import type { RealtimeAudioProvider, ProviderState } from './provider.js';
import { GeminiLiveSession } from './session.js';
import type { GeminiLiveSessionConfig } from './session.js';
import type { LatencyStats } from './types.js';

/**
 * Configuration for creating a GeminiProvider.
 * Same shape as GeminiLiveSessionConfig — no translation layer needed.
 */
export interface GeminiProviderConfig {
  apiKey: string;
  model: string;
  systemPrompt: string;
  maxRetries?: number;
}

/**
 * Adapter that wraps GeminiLiveSession behind the RealtimeAudioProvider interface.
 *
 * Uses composition (not inheritance) to keep GeminiLiveSession unchanged.
 * All events from the underlying session are forwarded through the provider.
 * Consumers interact with the generic interface, not Gemini-specific APIs.
 *
 * @example
 * ```typescript
 * const provider = new GeminiProvider({
 *   apiKey: process.env.GEMINI_API_KEY!,
 *   model: 'gemini-2.5-flash-native-audio-latest',
 *   systemPrompt: 'You are a helpful assistant',
 * });
 *
 * provider.on('audio', (pcm) => outputStream.write(pcm));
 * provider.on('text', (text) => transcript.writeAI(text));
 * await provider.connect();
 * ```
 */
export class GeminiProvider extends EventEmitter implements RealtimeAudioProvider {
  private readonly session: GeminiLiveSession;

  /**
   * Create a GeminiProvider wrapping a new GeminiLiveSession.
   *
   * @param config - Provider configuration (API key, model, prompt, retries)
   * @param aiOverride - Optional mock AI object for testing (passed to GeminiLiveSession)
   */
  constructor(config: GeminiProviderConfig, aiOverride?: any) {
    super();

    const sessionConfig: GeminiLiveSessionConfig = {
      apiKey: config.apiKey,
      model: config.model,
      systemPrompt: config.systemPrompt,
      maxRetries: config.maxRetries,
    };

    this.session = new GeminiLiveSession(sessionConfig, aiOverride);

    // Forward all 6 events from session to provider
    this.session.on('audio', (buf: Buffer) => this.emit('audio', buf));
    this.session.on('text', (text: string) => this.emit('text', text));
    this.session.on('connected', () => this.emit('connected'));
    this.session.on('disconnected', () => this.emit('disconnected'));
    this.session.on('error', (err: Error) => this.emit('error', err));
    this.session.on('latency', (ms: number) => this.emit('latency', ms));
  }

  /** Connect to the Gemini Live API. */
  async connect(): Promise<void> {
    return this.session.connect();
  }

  /** Send a 16kHz PCM audio chunk to the Gemini Live API. */
  sendAudio(pcm16k: Buffer): void {
    this.session.sendAudio(pcm16k);
  }

  /** Disconnect from the Gemini Live API. */
  async disconnect(): Promise<void> {
    return this.session.disconnect();
  }

  /** Get current connection state. */
  getState(): ProviderState {
    return this.session.getState() as ProviderState;
  }

  /**
   * Get latency statistics from the underlying Gemini session.
   * Gemini-specific convenience method — not part of the RealtimeAudioProvider interface.
   */
  getLatencyStats(): LatencyStats {
    return this.session.getLatencyStats();
  }
}
