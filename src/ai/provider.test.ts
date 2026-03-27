import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MockProvider } from './provider.js';
import type { RealtimeAudioProvider, ProviderState } from './provider.js';

describe('MockProvider', () => {
  it('implements RealtimeAudioProvider interface', () => {
    const provider: RealtimeAudioProvider = new MockProvider();
    // Type check — if this compiles, the interface is satisfied
    assert.ok(provider);
  });

  it('starts in disconnected state', () => {
    const provider = new MockProvider();
    assert.equal(provider.getState(), 'disconnected');
  });

  it('connect() sets state to connected and emits event', async () => {
    const provider = new MockProvider();
    let emitted = false;
    provider.on('connected', () => { emitted = true; });
    await provider.connect();
    assert.equal(provider.getState(), 'connected');
    assert.ok(emitted);
  });

  it('disconnect() sets state to disconnected and emits event', async () => {
    const provider = new MockProvider();
    await provider.connect();
    let emitted = false;
    provider.on('disconnected', () => { emitted = true; });
    await provider.disconnect();
    assert.equal(provider.getState(), 'disconnected');
    assert.ok(emitted);
  });

  it('sendAudio() stores chunks in sentChunks', () => {
    const provider = new MockProvider();
    const chunk1 = Buffer.from([1, 2, 3]);
    const chunk2 = Buffer.from([4, 5, 6]);
    provider.sendAudio(chunk1);
    provider.sendAudio(chunk2);
    assert.equal(provider.sentChunks.length, 2);
    assert.deepEqual(provider.sentChunks[0], chunk1);
    assert.deepEqual(provider.sentChunks[1], chunk2);
  });

  it('simulateAudio() emits audio event', () => {
    const provider = new MockProvider();
    let received: Buffer | null = null;
    provider.on('audio', (buf: Buffer) => { received = buf; });
    const pcm = Buffer.from([10, 20, 30]);
    provider.simulateAudio(pcm);
    assert.deepEqual(received, pcm);
  });

  it('simulateText() emits text event', () => {
    const provider = new MockProvider();
    let received: string | null = null;
    provider.on('text', (text: string) => { received = text; });
    provider.simulateText('hello world');
    assert.equal(received, 'hello world');
  });

  it('simulateError() emits error event', () => {
    const provider = new MockProvider();
    let received: Error | null = null;
    provider.on('error', (err: Error) => { received = err; });
    const error = new Error('test error');
    provider.simulateError(error);
    assert.equal(received, error);
  });

  it('simulateLatency() emits latency event', () => {
    const provider = new MockProvider();
    let received: number | null = null;
    provider.on('latency', (ms: number) => { received = ms; });
    provider.simulateLatency(150);
    assert.equal(received, 150);
  });
});

describe('ProviderState type', () => {
  it('accepts all four valid states', () => {
    // Type-level test: these assignments must compile
    const states: ProviderState[] = [
      'disconnected',
      'connecting',
      'connected',
      'reconnecting',
    ];
    assert.equal(states.length, 4);
  });
});
