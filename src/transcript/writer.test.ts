import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, unlinkSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { TranscriptWriter } from './writer.js';

describe('TranscriptWriter', () => {
  let tempFile: string;

  afterEach(() => {
    try { unlinkSync(tempFile); } catch { /* ignore */ }
  });

  it('constructor creates empty file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'transcript-test-'));
    tempFile = join(dir, 'transcript.log');
    new TranscriptWriter(tempFile);
    const content = readFileSync(tempFile, 'utf8');
    assert.equal(content, '');
  });

  it('writeParticipant appends correct format', () => {
    const dir = mkdtempSync(join(tmpdir(), 'transcript-test-'));
    tempFile = join(dir, 'transcript.log');
    const writer = new TranscriptWriter(tempFile);
    writer.writeParticipant('Hello everyone');
    const content = readFileSync(tempFile, 'utf8');
    assert.equal(content, '[Participant] Hello everyone\n');
  });

  it('writeAI appends correct format with persona name', () => {
    const dir = mkdtempSync(join(tmpdir(), 'transcript-test-'));
    tempFile = join(dir, 'transcript.log');
    const writer = new TranscriptWriter(tempFile);
    writer.writeAI('Aria', 'Hi there, nice to meet you');
    const content = readFileSync(tempFile, 'utf8');
    assert.equal(content, '[AI:Aria] Hi there, nice to meet you\n');
  });

  it('multiple writes append sequentially', () => {
    const dir = mkdtempSync(join(tmpdir(), 'transcript-test-'));
    tempFile = join(dir, 'transcript.log');
    const writer = new TranscriptWriter(tempFile);
    writer.writeParticipant('Hello');
    writer.writeAI('Bot', 'Hi');
    writer.writeParticipant('How are you?');
    writer.writeAI('Bot', 'Great, thanks!');
    const content = readFileSync(tempFile, 'utf8');
    assert.equal(content, [
      '[Participant] Hello',
      '[AI:Bot] Hi',
      '[Participant] How are you?',
      '[AI:Bot] Great, thanks!',
      '',
    ].join('\n'));
  });
});
