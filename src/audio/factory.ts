import { detectPlatform, type Platform } from '../platform/detect.js';
import { NativeAudioCapture } from './capture.js';
import { NativeAudioOutput } from './output.js';
import { Wsl2AudioCapture } from './wsl2-capture.js';
import { Wsl2AudioOutput } from './wsl2-output.js';
import type { AudioCapture, AudioOutput } from './types.js';

/**
 * Create an AudioCapture instance for the current platform.
 *
 * - Native Linux: NativeAudioCapture (parec from sink monitor)
 * - WSL2: Wsl2AudioCapture (TCP relay to Windows)
 *
 * @param sinkName - PulseAudio sink name (e.g., 'ai_meet_sink')
 * @param platform - Override platform detection (for testing/DI)
 */
export function createAudioCapture(sinkName: string, platform?: Platform): AudioCapture {
  const p = platform ?? detectPlatform();
  if (p === 'wsl2') {
    return new Wsl2AudioCapture(sinkName);
  }
  return new NativeAudioCapture(sinkName);
}

/**
 * Create an AudioOutput instance for the current platform.
 *
 * - Native Linux: NativeAudioOutput (pacat to sink)
 * - WSL2: Wsl2AudioOutput (TCP relay to Windows)
 *
 * @param sinkName - PulseAudio sink name (e.g., 'ai_meet_mic')
 * @param platform - Override platform detection (for testing/DI)
 */
export function createAudioOutput(sinkName: string, platform?: Platform): AudioOutput {
  const p = platform ?? detectPlatform();
  if (p === 'wsl2') {
    return new Wsl2AudioOutput(sinkName);
  }
  return new NativeAudioOutput(sinkName);
}
