import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GeminiProvider } from './gemini-provider.js';
import type { RealtimeAudioProvider } from './provider.js';

/**
 * Create a mock AI object that mimics @google/genai's live.connect behavior.
 * Returns a controllable mock session for testing event forwarding.
 */
function createMockAI() {
  const callbacks: { onmessage?: Function; onerror?: Function; onclose?: Function } = {};
  const mockSession = {
    sendRealtimeInput: (_data: any) => {},
    close: () => {},
    // Expose callbacks for test triggering
    _callbacks: callbacks,
  };

  const ai = {
    live: {
      connect: async (_config: any) => {
        // Store callbacks so tests can trigger them
        callbacks.onmessage = _config.callbacks.onmessage;
        callbacks.onerror = _config.callbacks.onerror;
        callbacks.onclose = _config.callbacks.onclose;
        return mockSession;
      },
    },
  };

  return { ai, mockSession, callbacks };
}

describe('GeminiProvider', () => {
  it('implements RealtimeAudioProvider interface', () => {
    const { ai } = createMockAI();
    const provider: RealtimeAudioProvider = new GeminiProvider({
      apiKey: 'test-key',
      model: 'test-model',
      systemPrompt: 'test prompt',
    }, ai);
    assert.ok(provider);
  });

  it('starts in disconnected state', () => {
    const { ai } = createMockAI();
    const provider = new GeminiProvider({
      apiKey: 'test-key',
      model: 'test-model',
      systemPrompt: 'test prompt',
    }, ai);
    assert.equal(provider.getState(), 'disconnected');
  });

  it('connect() delegates to GeminiLiveSession and emits connected', async () => {
    const { ai } = createMockAI();
    const provider = new GeminiProvider({
      apiKey: 'test-key',
      model: 'test-model',
      systemPrompt: 'test prompt',
    }, ai);

    let emitted = false;
    provider.on('connected', () => { emitted = true; });

    await provider.connect();
    assert.equal(provider.getState(), 'connected');
    assert.ok(emitted);
  });

  it('sendAudio() delegates to GeminiLiveSession', async () => {
    const { ai, mockSession } = createMockAI();
    let sentData: any = null;
    mockSession.sendRealtimeInput = (data: any) => { sentData = data; };

    const provider = new GeminiProvider({
      apiKey: 'test-key',
      model: 'test-model',
      systemPrompt: 'test prompt',
    }, ai);

    await provider.connect();
    const chunk = Buffer.from([1, 2, 3, 4]);
    provider.sendAudio(chunk);
    assert.ok(sentData);
    assert.equal(sentData.media.mimeType, 'audio/pcm;rate=16000');
  });

  it('disconnect() delegates to GeminiLiveSession and emits disconnected', async () => {
    const { ai } = createMockAI();
    const provider = new GeminiProvider({
      apiKey: 'test-key',
      model: 'test-model',
      systemPrompt: 'test prompt',
    }, ai);

    await provider.connect();

    let emitted = false;
    provider.on('disconnected', () => { emitted = true; });

    await provider.disconnect();
    assert.equal(provider.getState(), 'disconnected');
    assert.ok(emitted);
  });

  it('forwards text events from session', async () => {
    const { ai, callbacks } = createMockAI();
    const provider = new GeminiProvider({
      apiKey: 'test-key',
      model: 'test-model',
      systemPrompt: 'test prompt',
    }, ai);

    let receivedText: string | null = null;
    provider.on('text', (text: string) => { receivedText = text; });

    await provider.connect();

    // Simulate a text message from Gemini
    callbacks.onmessage!({
      serverContent: {
        outputTranscription: { text: 'hello from gemini' },
      },
    });

    assert.equal(receivedText, 'hello from gemini');
  });

  it('forwards error events from session', async () => {
    const { ai, callbacks } = createMockAI();
    const provider = new GeminiProvider({
      apiKey: 'test-key',
      model: 'test-model',
      systemPrompt: 'test prompt',
    }, ai);

    let receivedError: Error | null = null;
    provider.on('error', (err: Error) => { receivedError = err; });

    await provider.connect();

    // Simulate a permanent error from Gemini
    const testError = new Error('403 Forbidden: invalid API key');
    callbacks.onerror!(testError);

    assert.ok(receivedError);
    assert.ok((receivedError as Error).message.includes('403'));
  });
});
