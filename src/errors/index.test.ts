import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AgentError,
  ConfigError,
  DeviceError,
  AISessionError,
  AudioPipelineError,
} from './index.js';

describe('AgentError', () => {
  it('carries message, hint, and exitCode', () => {
    const err = new AgentError('something broke', 'try restarting');
    assert.equal(err.message, 'something broke');
    assert.equal(err.hint, 'try restarting');
    assert.equal(err.exitCode, 1);
  });

  it('defaults exitCode to 1', () => {
    const err = new AgentError('msg', 'hint');
    assert.equal(err.exitCode, 1);
  });

  it('accepts custom exitCode', () => {
    const err = new AgentError('msg', 'hint', 42);
    assert.equal(err.exitCode, 42);
  });

  it('sets name to AgentError', () => {
    const err = new AgentError('msg', 'hint');
    assert.equal(err.name, 'AgentError');
  });

  it('is instanceof Error', () => {
    const err = new AgentError('msg', 'hint');
    assert.ok(err instanceof Error);
  });
});

describe('ConfigError', () => {
  it('has exitCode 2 and default hint', () => {
    const err = new ConfigError('bad config');
    assert.equal(err.exitCode, 2);
    assert.equal(err.hint, 'Check your config.json');
    assert.equal(err.message, 'bad config');
  });

  it('accepts custom hint', () => {
    const err = new ConfigError('bad config', 'custom hint');
    assert.equal(err.hint, 'custom hint');
  });

  it('sets name to ConfigError', () => {
    const err = new ConfigError('msg');
    assert.equal(err.name, 'ConfigError');
  });

  it('is instanceof AgentError', () => {
    const err = new ConfigError('msg');
    assert.ok(err instanceof AgentError);
    assert.ok(err instanceof Error);
  });
});

describe('DeviceError', () => {
  it('has exitCode 3 and default hint', () => {
    const err = new DeviceError('no device');
    assert.equal(err.exitCode, 3);
    assert.equal(err.hint, 'Run "bash scripts/setup.sh" to install prerequisites');
  });

  it('sets name to DeviceError', () => {
    assert.equal(new DeviceError('msg').name, 'DeviceError');
  });

  it('is instanceof AgentError', () => {
    assert.ok(new DeviceError('msg') instanceof AgentError);
  });
});

describe('AISessionError', () => {
  it('has exitCode 4 and default hint', () => {
    const err = new AISessionError('session failed');
    assert.equal(err.exitCode, 4);
    assert.equal(err.hint, 'Check GEMINI_API_KEY and network connection');
  });

  it('sets name to AISessionError', () => {
    assert.equal(new AISessionError('msg').name, 'AISessionError');
  });

  it('is instanceof AgentError', () => {
    assert.ok(new AISessionError('msg') instanceof AgentError);
  });
});

describe('AudioPipelineError', () => {
  it('has exitCode 5 and default hint', () => {
    const err = new AudioPipelineError('no audio');
    assert.equal(err.exitCode, 5);
    assert.equal(err.hint, 'Check PulseAudio/PipeWire setup');
  });

  it('sets name to AudioPipelineError', () => {
    assert.equal(new AudioPipelineError('msg').name, 'AudioPipelineError');
  });

  it('is instanceof AgentError', () => {
    assert.ok(new AudioPipelineError('msg') instanceof AgentError);
  });
});
