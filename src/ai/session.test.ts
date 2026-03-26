import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { GeminiLiveSession } from './session.js';

// Mock session object returned by ai.live.connect()
function createMockSession() {
  return {
    sendRealtimeInput: mock.fn(),
    close: mock.fn(),
  };
}

// Create a mock GoogleGenAI-like object
function createMockAI(mockSession: ReturnType<typeof createMockSession>, connectBehavior?: 'fail-permanent' | 'fail-transient') {
  return {
    live: {
      connect: mock.fn(async (_config: any) => {
        if (connectBehavior === 'fail-permanent') {
          throw new Error('403 Forbidden: invalid API key');
        }
        if (connectBehavior === 'fail-transient') {
          throw new Error('ECONNRESET: connection reset');
        }
        return mockSession;
      }),
    },
  };
}

describe('GeminiLiveSession', () => {
  let session: GeminiLiveSession;
  let mockSession: ReturnType<typeof createMockSession>;
  let mockAI: ReturnType<typeof createMockAI>;

  beforeEach(() => {
    mockSession = createMockSession();
    mockAI = createMockAI(mockSession);
  });

  it('connect() calls ai.live.connect with correct config', async () => {
    session = new GeminiLiveSession({
      apiKey: 'test-key',
      model: 'gemini-test-model',
      systemPrompt: 'You are a test bot.',
      maxRetries: 1,
    }, mockAI as any);

    await session.connect();

    assert.equal(mockAI.live.connect.mock.callCount(), 1);
    const callArgs = mockAI.live.connect.mock.calls[0].arguments[0];
    assert.equal(callArgs.model, 'gemini-test-model');
    assert.deepEqual(callArgs.config.responseModalities, ['AUDIO']);
    assert.ok(callArgs.config.systemInstruction.parts[0].text.includes('You are a test bot.'));
  });

  it('sendAudio() base64-encodes PCM and sends via session.sendRealtimeInput', async () => {
    session = new GeminiLiveSession({
      apiKey: 'test-key',
      model: 'test-model',
      systemPrompt: 'Test',
      maxRetries: 1,
    }, mockAI as any);

    await session.connect();

    const pcmChunk = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    session.sendAudio(pcmChunk);

    assert.equal(mockSession.sendRealtimeInput.mock.callCount(), 1);
    const sendArgs = mockSession.sendRealtimeInput.mock.calls[0].arguments[0];
    assert.equal(sendArgs.media.data, pcmChunk.toString('base64'));
    assert.equal(sendArgs.media.mimeType, 'audio/pcm;rate=16000');
  });

  it('sendAudio() drops audio when not connected', () => {
    session = new GeminiLiveSession({
      apiKey: 'test-key',
      model: 'test-model',
      systemPrompt: 'Test',
      maxRetries: 1,
    }, mockAI as any);

    // Not connected yet — should silently drop
    const pcmChunk = Buffer.from([0x01, 0x02]);
    session.sendAudio(pcmChunk);

    // mockSession.sendRealtimeInput should not have been called
    assert.equal(mockSession.sendRealtimeInput.mock.callCount(), 0);
  });

  it('state transitions: disconnected -> connecting -> connected', async () => {
    session = new GeminiLiveSession({
      apiKey: 'test-key',
      model: 'test-model',
      systemPrompt: 'Test',
      maxRetries: 1,
    }, mockAI as any);

    assert.equal(session.getState(), 'disconnected');

    const connectPromise = session.connect();
    // During connect, state should be connecting or connected
    await connectPromise;
    assert.equal(session.getState(), 'connected');
  });

  it('disconnect() closes session cleanly', async () => {
    session = new GeminiLiveSession({
      apiKey: 'test-key',
      model: 'test-model',
      systemPrompt: 'Test',
      maxRetries: 1,
    }, mockAI as any);

    await session.connect();
    assert.equal(session.getState(), 'connected');

    await session.disconnect();
    assert.equal(session.getState(), 'disconnected');
    assert.equal(mockSession.close.mock.callCount(), 1);
  });

  it('emits connected event on successful connection', async () => {
    session = new GeminiLiveSession({
      apiKey: 'test-key',
      model: 'test-model',
      systemPrompt: 'Test',
      maxRetries: 1,
    }, mockAI as any);

    let connected = false;
    session.on('connected', () => { connected = true; });

    await session.connect();
    assert.ok(connected);
  });

  it('emits disconnected event on disconnect', async () => {
    session = new GeminiLiveSession({
      apiKey: 'test-key',
      model: 'test-model',
      systemPrompt: 'Test',
      maxRetries: 1,
    }, mockAI as any);

    await session.connect();

    let disconnected = false;
    session.on('disconnected', () => { disconnected = true; });

    await session.disconnect();
    assert.ok(disconnected);
  });

  it('does NOT reconnect on permanent error (403)', async () => {
    const failAI = createMockAI(mockSession, 'fail-permanent');
    session = new GeminiLiveSession({
      apiKey: 'bad-key',
      model: 'test-model',
      systemPrompt: 'Test',
      maxRetries: 3,
    }, failAI as any);

    let errorEmitted = false;
    session.on('error', () => { errorEmitted = true; });

    await session.connect().catch(() => {});

    // Should have only tried once (permanent error, no retry)
    assert.equal(failAI.live.connect.mock.callCount(), 1);
    assert.equal(session.getState(), 'disconnected');
  });

  it('getLatencyStats returns stats from tracker', async () => {
    session = new GeminiLiveSession({
      apiKey: 'test-key',
      model: 'test-model',
      systemPrompt: 'Test',
      maxRetries: 1,
    }, mockAI as any);

    const stats = session.getLatencyStats();
    assert.equal(stats.count, 0);
    assert.equal(stats.lastMs, 0);
  });
});
