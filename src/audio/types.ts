import { type Readable, type Writable } from 'stream';
import { EventEmitter } from 'events';

/**
 * Standard internal audio format: 16kHz, 16-bit signed LE, mono.
 * Matches voice AI API expectations (Gemini Live, etc.).
 */
export const AUDIO_FORMAT = {
  sampleRate: 16000,
  bitDepth: 16,
  channels: 1,
  encoding: 's16le' as const,
} as const;

/** Configuration for audio capture or output. */
export interface AudioConfig {
  sinkName: string;
  format: typeof AUDIO_FORMAT;
}

/**
 * Audio capture interface — reads PCM audio from a source.
 *
 * Events:
 * - 'reconnecting': Subprocess died, attempting reconnect
 * - 'error': Fatal error (Error payload)
 * - 'level': RMS audio level (number payload, 0-1 normalized)
 */
export interface AudioCapture extends EventEmitter {
  start(): Readable;
  stop(): void;
}

/**
 * Audio output interface — writes PCM audio to a sink.
 *
 * Events:
 * - 'error': Fatal error (Error payload)
 * - 'level': RMS audio level (number payload, 0-1 normalized)
 */
export interface AudioOutput extends EventEmitter {
  start(): Writable;
  stop(): void;
}
