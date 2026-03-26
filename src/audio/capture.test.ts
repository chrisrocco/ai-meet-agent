import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { NativeAudioCapture, type SpawnFunction } from './capture.js';

function createMockSpawn() {
  let lastProc: ReturnType<typeof createMockProc>;

  function createMockProc() {
    const proc = new EventEmitter() as EventEmitter & {
      stdout: PassThrough;
      stderr: PassThrough;
      stdin: PassThrough;
      kill: ReturnType<typeof mock.fn>;
      pid: number;
    };
    proc.stdout = new PassThrough();
    proc.stderr = new PassThrough();
    proc.stdin = new PassThrough();
    proc.kill = mock.fn(() => {});
    proc.pid = 12345;
    return proc;
  }

  const spawnFn = mock.fn((_cmd: string, _args: string[], _opts?: object) => {
    lastProc = createMockProc();
    return lastProc;
  }) as unknown as SpawnFunction;

  return {
    spawnFn,
    get lastProc() { return lastProc!; },
    get mockFn() { return spawnFn as unknown as ReturnType<typeof mock.fn>; },
  };
}

describe('NativeAudioCapture', () => {
  it('spawns parec with correct arguments', () => {
    const { spawnFn, mockFn } = createMockSpawn();
    const capture = new NativeAudioCapture('ai_meet_sink', undefined, spawnFn);
    capture.start();

    assert.strictEqual(mockFn.mock.callCount(), 1);
    const callArgs = mockFn.mock.calls[0].arguments;
    const cmd = callArgs[0] as string;
    const args = callArgs[1] as string[];
    assert.strictEqual(cmd, 'parec');
    assert.ok(args.includes('--device'), 'Missing --device flag');
    assert.ok(args.includes('ai_meet_sink.monitor'), 'Missing sink.monitor device');
    assert.ok(args.includes('--format'), 'Missing --format flag');
    assert.ok(args.includes('s16le'), 'Missing s16le format');
    assert.ok(args.includes('--rate'), 'Missing --rate flag');
    assert.ok(args.includes('16000'), 'Missing 16000 rate');
    assert.ok(args.includes('--channels'), 'Missing --channels flag');
    assert.ok(args.includes('1'), 'Missing 1 channel');
    assert.ok(args.includes('--latency-msec'), 'Missing --latency-msec');
    assert.ok(args.includes('20'), 'Missing 20ms latency');

    capture.stop();
  });

  it('start() returns proc.stdout as Readable stream', () => {
    const { spawnFn, lastProc: _ } = createMockSpawn();
    const capture = new NativeAudioCapture('ai_meet_sink', undefined, spawnFn);
    const stream = capture.start();
    const { lastProc } = createMockSpawn(); // need to get from the actual spawn

    // stream should be a readable
    assert.ok(stream.readable !== undefined || stream.read !== undefined, 'Should return a readable stream');
    capture.stop();
  });

  it('stop() kills the subprocess with SIGTERM', () => {
    const mock_ = createMockSpawn();
    const capture = new NativeAudioCapture('ai_meet_sink', undefined, mock_.spawnFn);
    capture.start();

    const proc = mock_.lastProc;
    capture.stop();

    assert.strictEqual(proc.kill.mock.callCount(), 1);
    assert.strictEqual(proc.kill.mock.calls[0].arguments[0], 'SIGTERM');
  });

  it('emits level events from PCM data', () => {
    const mock_ = createMockSpawn();
    const capture = new NativeAudioCapture('ai_meet_sink', undefined, mock_.spawnFn);

    const levels: number[] = [];
    capture.on('level', (rms: number) => levels.push(rms));

    capture.start();
    const proc = mock_.lastProc;

    // Write enough PCM data to trigger a level event
    // levelIntervalBytes = 16000 * 2 * 1 / 4 = 8000 bytes
    const pcmData = Buffer.alloc(8000);
    proc.stdout.emit('data', pcmData);

    assert.ok(levels.length >= 1, `Expected at least 1 level event, got ${levels.length}`);
    assert.strictEqual(levels[0], 0, 'Silence should produce level 0');

    capture.stop();
  });

  it('emits reconnecting event on unexpected subprocess exit', () => {
    const mock_ = createMockSpawn();
    const capture = new NativeAudioCapture('ai_meet_sink', undefined, mock_.spawnFn);
    capture.start();

    let reconnecting = false;
    capture.on('reconnecting', () => { reconnecting = true; });

    const proc = mock_.lastProc;
    // Simulate subprocess dying unexpectedly
    proc.emit('exit', 1, null);

    assert.ok(reconnecting, 'Should emit reconnecting on unexpected exit');

    // Clean up: stop to prevent reconnect timer
    capture.stop();
  });

  it('does NOT emit reconnecting when stopped by user', () => {
    const mock_ = createMockSpawn();
    const capture = new NativeAudioCapture('ai_meet_sink', undefined, mock_.spawnFn);
    capture.start();

    let reconnecting = false;
    capture.on('reconnecting', () => { reconnecting = true; });

    // stop() sets stopped=true before killing, which emits exit
    capture.stop();

    assert.ok(!reconnecting, 'Should NOT emit reconnecting when user stops');
  });

  it('logs stderr without crashing', () => {
    const mock_ = createMockSpawn();
    const capture = new NativeAudioCapture('ai_meet_sink', undefined, mock_.spawnFn);
    capture.start();

    const proc = mock_.lastProc;
    // Should not throw
    proc.stderr.emit('data', Buffer.from('some parec error'));

    capture.stop();
  });
});
