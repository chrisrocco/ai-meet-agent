import { GoogleGenAI, Modality } from '@google/genai';
import { EventEmitter } from 'events';
import type { GeminiSessionState, LatencyStats } from './types.js';
import { downsample24to16 } from './audio-converter.js';
import { LatencyTracker } from './latency.js';

export interface GeminiLiveSessionConfig {
  apiKey: string;
  model: string;
  systemPrompt: string;
  maxRetries?: number;
}

/**
 * Wraps the @google/genai Live API session with reconnection logic,
 * error classification, audio format conversion, and latency tracking.
 *
 * Events:
 * - 'audio' (Buffer) — 16kHz PCM audio from AI response
 * - 'connected' — session connected
 * - 'disconnected' — session disconnected
 * - 'error' (Error) — fatal error (permanent or retries exhausted)
 * - 'latency' (number) — round-trip latency in ms
 */
export class GeminiLiveSession extends EventEmitter {
  private ai: { live: { connect: (config: any) => Promise<any> } };
  private session: any | null = null;
  private state: GeminiSessionState = 'disconnected';
  private retryCount = 0;
  private readonly maxRetries: number;
  private readonly config: GeminiLiveSessionConfig;
  private readonly latency: LatencyTracker;
  private intentionalDisconnect = false;
  private hasReceivedAudioSinceSend = true;

  constructor(config: GeminiLiveSessionConfig, aiOverride?: any) {
    super();
    this.config = config;
    this.maxRetries = config.maxRetries ?? 5;
    this.latency = new LatencyTracker();

    // Allow injecting a mock AI object for testing
    this.ai = aiOverride ?? new GoogleGenAI({ apiKey: config.apiKey });

    // Forward latency events
    this.latency.on('latency', (ms: number) => this.emit('latency', ms));
  }

  /** Connect to the Gemini Live API. */
  async connect(): Promise<void> {
    this.state = 'connecting';
    this.intentionalDisconnect = false;

    try {
      this.session = await this.ai.live.connect({
        model: this.config.model,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: {
            parts: [{ text: this.config.systemPrompt }],
          },
        },
        callbacks: {
          onmessage: (msg: any) => this.handleMessage(msg),
          onerror: (err: Error) => this.handleError(err),
          onclose: () => this.handleClose(),
        },
      });

      this.state = 'connected';
      this.retryCount = 0;
      this.latency.startSummaryTimer();
      this.emit('connected');
    } catch (err) {
      this.state = 'disconnected';
      if (!this.isTransientError(err as Error)) {
        this.emit('error', err);
        throw err;
      }
      // Transient error on initial connect — attempt reconnect
      await this.reconnect();
    }
  }

  /** Send a PCM audio chunk to the Gemini Live API. */
  sendAudio(pcmChunk: Buffer): void {
    if (this.state !== 'connected' || !this.session) {
      return; // Silently drop — mic goes silent during reconnect per user decision
    }

    const base64 = pcmChunk.toString('base64');
    this.session.sendRealtimeInput({
      media: {
        data: base64,
        mimeType: 'audio/pcm;rate=16000',
      },
    });

    if (this.hasReceivedAudioSinceSend) {
      this.latency.markSent();
      this.hasReceivedAudioSinceSend = false;
    }
  }

  /** Disconnect from the Gemini Live API cleanly. */
  async disconnect(): Promise<void> {
    this.intentionalDisconnect = true;
    this.latency.stopSummaryTimer();

    if (this.session) {
      try {
        this.session.close();
      } catch {
        // Session may already be closed
      }
      this.session = null;
    }

    this.state = 'disconnected';
    this.emit('disconnected');
  }

  /** Get current session state. */
  getState(): GeminiSessionState {
    return this.state;
  }

  /** Get current latency statistics. */
  getLatencyStats(): LatencyStats {
    return this.latency.getStats();
  }

  /** Handle incoming messages from the Gemini Live API. */
  private handleMessage(msg: any): void {
    // Check for serverContent with audio parts
    const parts = msg?.serverContent?.modelTurn?.parts;
    if (!parts) return;

    for (const part of parts) {
      if (part?.inlineData?.data) {
        // Decode base64 audio (24kHz PCM) and downsample to 16kHz
        const pcm24k = Buffer.from(part.inlineData.data, 'base64');
        const pcm16k = downsample24to16(pcm24k);

        if (!this.hasReceivedAudioSinceSend) {
          this.latency.markReceived();
          this.hasReceivedAudioSinceSend = true;
        }

        this.emit('audio', pcm16k);
      }
    }
  }

  /** Handle WebSocket errors. */
  private handleError(err: Error): void {
    if (this.intentionalDisconnect) return;

    if (!this.isTransientError(err)) {
      console.error(`[AI] Permanent error: ${err.message}`);
      this.emit('error', err);
      return;
    }

    // Transient error — reconnect
    this.reconnect().catch((reconnectErr) => {
      this.emit('error', reconnectErr);
    });
  }

  /** Handle WebSocket close. */
  private handleClose(): void {
    if (this.intentionalDisconnect) return;

    console.log('[AI] Connection closed unexpectedly, attempting reconnect...');
    this.reconnect().catch((err) => {
      this.emit('error', err);
    });
  }

  /** Attempt to reconnect with exponential backoff. */
  private async reconnect(): Promise<void> {
    this.state = 'reconnecting';
    this.session = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
      console.log(`[AI] Reconnecting in ${delayMs}ms (attempt ${attempt}/${this.maxRetries})`);
      await new Promise(r => setTimeout(r, delayMs));

      try {
        this.state = 'connecting';
        this.session = await this.ai.live.connect({
          model: this.config.model,
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: {
              parts: [{ text: this.config.systemPrompt }],
            },
          },
          callbacks: {
            onmessage: (msg: any) => this.handleMessage(msg),
            onerror: (err: Error) => this.handleError(err),
            onclose: () => this.handleClose(),
          },
        });

        this.state = 'connected';
        this.retryCount = 0;
        console.log('[AI] Reconnected successfully');
        this.emit('connected');
        return;
      } catch (err) {
        if (!this.isTransientError(err as Error)) {
          console.error(`[AI] Permanent error during reconnect: ${(err as Error).message}`);
          this.state = 'disconnected';
          this.emit('error', err);
          return;
        }
      }
    }

    this.state = 'disconnected';
    const err = new Error(`[AI] Max retries exhausted (${this.maxRetries}). Could not reconnect.`);
    console.error(err.message);
    this.emit('error', err);
  }

  /** Classify error as transient (network) or permanent (auth/quota). */
  private isTransientError(error: Error): boolean {
    const msg = error.message.toLowerCase();
    const permanentPatterns = ['401', '403', '429', 'invalid', 'unauthorized', 'quota', 'forbidden'];
    return !permanentPatterns.some(pattern => msg.includes(pattern));
  }
}
