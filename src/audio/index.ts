/** Audio pipeline public API */
export { createAudioCapture, createAudioOutput } from './factory.js';
export type { AudioCapture, AudioOutput, AudioConfig } from './types.js';
export { AUDIO_FORMAT } from './types.js';
export { computeRms, computeRmsNormalized } from './pcm-utils.js';
