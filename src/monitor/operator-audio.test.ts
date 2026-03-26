import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { OperatorAudioMonitor } from './operator-audio.js';

// Create a mock child process
function createMockProc() {
  const stdin = new PassThrough();
  const proc = new EventEmitter() as any;
  proc.stdin = stdin;
  proc.kill = mock.fn();
  proc.pid = 12345;
  return proc;
}

describe('OperatorAudioMonitor', () => {
  let monitor: OperatorAudioMonitor;
  let mockProc: ReturnType<typeof createMockProc>;
  let spawnFn: any;

  beforeEach(() => {
    mockProc = createMockProc();
    spawnFn = mock.fn(() => mockProc);
    monitor = new OperatorAudioMonitor(spawnFn);
  });

  it('start() spawns ffplay with correct args for native-linux', () => {
    monitor.start('native-linux');

    assert.equal(spawnFn.mock.callCount(), 1);
    const [bin, args] = spawnFn.mock.calls[0].arguments;
    assert.equal(bin, 'ffplay');
    assert.ok(args.includes('-f'));
    assert.ok(args.includes('s16le'));
    assert.ok(args.includes('-ar'));
    assert.ok(args.includes('16000'));
    assert.ok(args.includes('-nodisp'));
    assert.ok(args.includes('pipe:0'));
  });

  it('start() uses ffplay.exe for wsl2 platform', () => {
    monitor.start('wsl2');

    const [bin] = spawnFn.mock.calls[0].arguments;
    assert.equal(bin, 'ffplay.exe');
  });

  it('start() uses custom ffplayPath when provided', () => {
    monitor.start('wsl2', '/custom/path/ffplay.exe');

    const [bin] = spawnFn.mock.calls[0].arguments;
    assert.equal(bin, '/custom/path/ffplay.exe');
  });

  it('write() sends data to stdin', () => {
    monitor.start('native-linux');

    const chunks: Buffer[] = [];
    mockProc.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));

    const pcm = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    monitor.write(pcm);

    assert.equal(chunks.length, 1);
    assert.deepEqual(chunks[0], pcm);
  });

  it('write() is no-op when process is null', () => {
    // Don't start — proc is null
    const pcm = Buffer.from([0x01, 0x02]);
    monitor.write(pcm); // Should not throw
  });

  it('stop() kills process and allows subsequent stop()', () => {
    monitor.start('native-linux');
    monitor.stop();

    assert.equal(mockProc.kill.mock.callCount(), 1);
    assert.equal(mockProc.kill.mock.calls[0].arguments[0], 'SIGTERM');

    // Second stop should not throw
    monitor.stop();
    // kill should still be 1 (not called again since proc was nulled)
    assert.equal(mockProc.kill.mock.callCount(), 1);
  });
});
