import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { NativeAudioOutput, type SpawnFunction } from './output.js';

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

describe('NativeAudioOutput', () => {
  it('spawns pacat with correct arguments', () => {
    const { spawnFn, mockFn } = createMockSpawn();
    const output = new NativeAudioOutput('ai_meet_mic', undefined, spawnFn);
    output.start();

    assert.strictEqual(mockFn.mock.callCount(), 1);
    const callArgs = mockFn.mock.calls[0].arguments;
    const cmd = callArgs[0] as string;
    const args = callArgs[1] as string[];
    assert.strictEqual(cmd, 'pacat');
    assert.ok(args.includes('--device'), 'Missing --device flag');
    assert.ok(args.includes('ai_meet_mic'), 'Missing device name');
    assert.ok(args.includes('--format'), 'Missing --format flag');
    assert.ok(args.includes('s16le'), 'Missing s16le format');
    assert.ok(args.includes('--rate'), 'Missing --rate flag');
    assert.ok(args.includes('16000'), 'Missing 16000 rate');
    assert.ok(args.includes('--channels'), 'Missing --channels flag');
    assert.ok(args.includes('1'), 'Missing 1 channel');
    assert.ok(args.includes('--latency-msec'), 'Missing --latency-msec');
    assert.ok(args.includes('20'), 'Missing 20ms latency');

    output.stop();
  });

  it('start() returns proc.stdin as Writable stream', () => {
    const { spawnFn } = createMockSpawn();
    const output = new NativeAudioOutput('ai_meet_mic', undefined, spawnFn);
    const stream = output.start();

    assert.ok(stream.writable !== undefined || stream.write !== undefined, 'Should return a writable stream');
    output.stop();
  });

  it('stop() ends stdin then kills subprocess with SIGTERM', () => {
    const mock_ = createMockSpawn();
    const output = new NativeAudioOutput('ai_meet_mic', undefined, mock_.spawnFn);
    output.start();

    const proc = mock_.lastProc;
    output.stop();

    assert.strictEqual(proc.kill.mock.callCount(), 1);
    assert.strictEqual(proc.kill.mock.calls[0].arguments[0], 'SIGTERM');
  });

  it('emits level events when PCM data is written', () => {
    const mock_ = createMockSpawn();
    const output = new NativeAudioOutput('ai_meet_mic', undefined, mock_.spawnFn);

    const levels: number[] = [];
    output.on('level', (rms: number) => levels.push(rms));

    const writable = output.start();

    // Write enough PCM data to trigger a level event (8000 bytes)
    const pcmData = Buffer.alloc(8000);
    writable.write(pcmData);

    assert.ok(levels.length >= 1, `Expected at least 1 level event, got ${levels.length}`);
    assert.strictEqual(levels[0], 0, 'Silence should produce level 0');

    output.stop();
  });

  it('logs stderr without crashing', () => {
    const mock_ = createMockSpawn();
    const output = new NativeAudioOutput('ai_meet_mic', undefined, mock_.spawnFn);
    output.start();

    const proc = mock_.lastProc;
    // Should not throw
    proc.stderr.emit('data', Buffer.from('some pacat error'));

    output.stop();
  });

  it('emits error event on subprocess error', () => {
    const mock_ = createMockSpawn();
    const output = new NativeAudioOutput('ai_meet_mic', undefined, mock_.spawnFn);

    const errors: Error[] = [];
    output.on('error', (err: Error) => errors.push(err));

    output.start();

    const proc = mock_.lastProc;
    const testError = new Error('spawn failed');
    proc.emit('error', testError);

    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0], testError);

    output.stop();
  });
});
