import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createAudioCapture, createAudioOutput } from './factory.js';
import { NativeAudioCapture } from './capture.js';
import { NativeAudioOutput } from './output.js';
import { Wsl2AudioCapture } from './wsl2-capture.js';
import { Wsl2AudioOutput } from './wsl2-output.js';

describe('createAudioCapture', () => {
  it('returns NativeAudioCapture on native-linux', () => {
    const capture = createAudioCapture('ai_meet_sink', 'native-linux');
    assert.ok(capture instanceof NativeAudioCapture,
      'Expected NativeAudioCapture on native-linux');
  });

  it('returns Wsl2AudioCapture on wsl2', () => {
    const capture = createAudioCapture('ai_meet_sink', 'wsl2');
    assert.ok(capture instanceof Wsl2AudioCapture,
      'Expected Wsl2AudioCapture on wsl2');
  });
});

describe('createAudioOutput', () => {
  it('returns NativeAudioOutput on native-linux', () => {
    const output = createAudioOutput('ai_meet_mic', 'native-linux');
    assert.ok(output instanceof NativeAudioOutput,
      'Expected NativeAudioOutput on native-linux');
  });

  it('returns Wsl2AudioOutput on wsl2', () => {
    const output = createAudioOutput('ai_meet_mic', 'wsl2');
    assert.ok(output instanceof Wsl2AudioOutput,
      'Expected Wsl2AudioOutput on wsl2');
  });
});
