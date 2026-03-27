import { spawn as defaultSpawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import type { Platform } from '../platform/detect.js';

/** Spawn function signature for dependency injection in tests. */
export type SpawnFunction = typeof defaultSpawn;

/**
 * Operator audio monitor — plays both participant and AI audio
 * through the operator's local speakers via ffplay.
 *
 * On by default. Operator hears both sides of the conversation
 * without joining the call as a second participant.
 */
export class OperatorAudioMonitor extends EventEmitter {
  private proc: ChildProcess | null = null;
  private readonly spawnFn: SpawnFunction;

  constructor(spawnFn?: SpawnFunction) {
    super();
    this.spawnFn = spawnFn ?? defaultSpawn;
  }

  /**
   * Start the operator audio monitor.
   * Spawns ffplay to play raw PCM from stdin through default audio output.
   *
   * @param platform - 'native-linux' or 'wsl2'
   * @param ffplayPath - Override ffplay binary path (for WSL2: 'ffplay.exe')
   */
  start(platform: Platform, ffplayPath?: string): void {
    const bin = ffplayPath ?? (platform === 'wsl2' ? 'ffplay.exe' : 'ffplay');
    const ffplayArgs = ['-f', 's16le', '-ar', '16000', '-ac', '1',
      '-nodisp', '-loglevel', 'warning', '-i', 'pipe:0'];

    // WSL2: WASAPI fails from WSL2 interop — launch via cmd.exe with
    // SDL_AUDIODRIVER=directsound to route through default DirectSound output.
    if (platform === 'wsl2') {
      const cmdLine = `set SDL_AUDIODRIVER=directsound&& ${bin} ${ffplayArgs.join(' ')}`;
      this.proc = this.spawnFn('cmd.exe', ['/C', cmdLine], {
        stdio: ['pipe', 'ignore', 'pipe'],
      });
    } else {
      this.proc = this.spawnFn(bin, ffplayArgs, {
        stdio: ['pipe', 'ignore', 'pipe'],
      });
    }

    this.proc.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.warn(`[Monitor] ${msg}`);
    });

    this.proc.stdin?.on('error', () => {
      // Absorb EPIPE — ffplay exited before we stopped writing
      this.proc = null;
    });

    this.proc.on('error', (err) => {
      console.warn(`[Monitor] ffplay error: ${err.message}`);
      this.proc = null;
    });

    this.proc.on('exit', (code, signal) => {
      if (code !== 0 && code !== null) {
        console.warn(`[Monitor] ffplay exited with code ${code} — operator will not hear audio`);
      }
      this.proc = null;
    });
  }

  /** Write PCM audio data to the monitor playback. */
  write(pcmChunk: Buffer): void {
    if (this.proc?.stdin && !this.proc.stdin.destroyed) {
      this.proc.stdin.write(pcmChunk);
    }
  }

  /** Stop the monitor playback. */
  stop(): void {
    if (this.proc) {
      try { this.proc.stdin?.end(); } catch { /* ignore */ }
      this.proc.kill('SIGTERM');
      this.proc = null;
    }
  }
}
