import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigSchema } from './schema.js';
import { loadConfig } from './loader.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Helper: create a temp config file
function makeTempConfig(contents: unknown): string {
  const dir = mkdirSync(join(tmpdir(), `cfg-test-${Date.now()}`), { recursive: true }) ?? join(tmpdir(), `cfg-test-${Date.now()}`);
  const fullDir = join(tmpdir(), `cfg-test-${Date.now()}-d`);
  mkdirSync(fullDir, { recursive: true });
  const path = join(fullDir, 'config.json');
  writeFileSync(path, JSON.stringify(contents), 'utf8');
  return path;
}

describe('loadConfig', () => {
  it('returns a Config object with all fields when given valid config.json', () => {
    const path = makeTempConfig({
      devices: {
        camera: { label: 'My Camera', videoNr: 5 },
        mic: { label: 'My Mic', sinkName: 'my_mic' },
        sink: { label: 'My Sink', sinkName: 'my_sink' },
      },
    });
    const cfg = loadConfig(path);
    assert.equal(cfg.devices.camera.label, 'My Camera');
    assert.equal(cfg.devices.camera.videoNr, 5);
    assert.equal(cfg.devices.mic.label, 'My Mic');
    assert.equal(cfg.devices.mic.sinkName, 'my_mic');
    assert.equal(cfg.devices.sink.label, 'My Sink');
    assert.equal(cfg.devices.sink.sinkName, 'my_sink');
  });

  it('fills in all defaults when given an empty {} config.json', () => {
    const path = makeTempConfig({});
    const cfg = loadConfig(path);
    assert.equal(cfg.devices.camera.label, 'AI Meet Agent Camera');
    assert.equal(cfg.devices.camera.videoNr, 10);
    assert.equal(cfg.devices.mic.label, 'AI Meet Agent Mic');
    assert.equal(cfg.devices.mic.sinkName, 'ai_meet_mic');
    assert.equal(cfg.devices.sink.label, 'AI Meet Agent Sink');
    assert.equal(cfg.devices.sink.sinkName, 'ai_meet_sink');
  });

  it('throws when config is missing the "devices" key with a null value', () => {
    const path = makeTempConfig({ devices: null });
    assert.throws(
      () => loadConfig(path),
      (err: Error) => {
        assert.ok(err.message.includes('Invalid config.json'), `Expected 'Invalid config.json' in: ${err.message}`);
        return true;
      }
    );
  });

  it('throws a ZodError when videoNr is 99 (above max 63)', () => {
    const path = makeTempConfig({
      devices: {
        camera: { label: 'X', videoNr: 99 },
        mic: { label: 'Y', sinkName: 'y' },
        sink: { label: 'Z', sinkName: 'z' },
      },
    });
    assert.throws(
      () => loadConfig(path),
      (err: Error) => {
        assert.ok(err.message.includes('Invalid config.json'), `Expected 'Invalid config.json' in: ${err.message}`);
        return true;
      }
    );
  });
});

describe('ConfigSchema persona defaults', () => {
  it('provides persona defaults when parsing empty object', () => {
    const cfg = ConfigSchema.parse({});
    assert.equal(cfg.persona.name, 'AI Assistant');
    assert.equal(cfg.persona.role, 'Meeting Participant');
    assert.equal(cfg.persona.background, '');
    assert.equal(cfg.persona.instructions, '');
    assert.equal(cfg.persona.introduceOnStart, true);
  });

  it('merges partial persona config with defaults', () => {
    const cfg = ConfigSchema.parse({
      persona: { name: 'Bob', role: 'Developer' },
    });
    assert.equal(cfg.persona.name, 'Bob');
    assert.equal(cfg.persona.role, 'Developer');
    assert.equal(cfg.persona.background, '');
    assert.equal(cfg.persona.instructions, '');
    assert.equal(cfg.persona.introduceOnStart, true);
  });
});

describe('ConfigSchema ai defaults', () => {
  it('provides ai model default when parsing empty object', () => {
    const cfg = ConfigSchema.parse({});
    assert.equal(cfg.ai.model, 'gemini-2.5-flash-native-audio-preview-12-2025');
  });

  it('allows overriding ai model', () => {
    const cfg = ConfigSchema.parse({ ai: { model: 'custom-model' } });
    assert.equal(cfg.ai.model, 'custom-model');
  });
});

describe('ConfigSchema existing fields unchanged', () => {
  it('still parses device/audio/video config correctly', () => {
    const cfg = ConfigSchema.parse({
      devices: { camera: { label: 'Test Cam', videoNr: 5 } },
      audio: { relayPort: 9999 },
      video: { mjpegPort: 7777 },
    });
    assert.equal(cfg.devices.camera.label, 'Test Cam');
    assert.equal(cfg.devices.camera.videoNr, 5);
    assert.equal(cfg.audio.relayPort, 9999);
    assert.equal(cfg.video.mjpegPort, 7777);
  });
});

describe('ConfigSchema full defaults', () => {
  it('parse({}) returns valid config with all defaults populated', () => {
    const cfg = ConfigSchema.parse({});
    assert.equal(cfg.devices.camera.label, 'AI Meet Agent Camera');
    assert.equal(cfg.devices.camera.videoNr, 10);
    assert.equal(cfg.devices.mic.sinkName, 'ai_meet_mic');
    assert.equal(cfg.devices.sink.sinkName, 'ai_meet_sink');
    assert.equal(cfg.audio.relayPort, 19876);
    assert.equal(cfg.video.mjpegPort, 8085);
    assert.equal(cfg.persona.name, 'AI Assistant');
    assert.equal(cfg.ai.model, 'gemini-2.5-flash-native-audio-preview-12-2025');
    assert.equal(cfg.wsl2.captureDevice, 'CABLE Output (VB-Audio Virtual Cable)');
  });
});

// parseCliArgs tests removed — CLI argument parsing now handled by Commander.js
// See src/cli/index.ts and src/cli/commands/start.ts
