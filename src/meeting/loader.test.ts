import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadMeetingContext } from './loader.js';

describe('loadMeetingContext', () => {
  let tempDir: string;
  let tempFile: string;

  afterEach(() => {
    try { unlinkSync(tempFile); } catch { /* ignore */ }
  });

  it('returns file contents for a valid meeting file', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'meeting-test-'));
    tempFile = join(tempDir, 'meeting.md');
    const content = '## Agenda\n- Discuss Q1 results\n\n## Attendees\n- Alice (PM)\n- Bob (Eng)';
    writeFileSync(tempFile, content);

    const result = loadMeetingContext(tempFile);
    assert.equal(result, content);
  });

  it('throws descriptive error for nonexistent file', () => {
    tempFile = '/tmp/nonexistent-meeting-file-12345.md';
    assert.throws(
      () => loadMeetingContext(tempFile),
      (err: Error) => {
        assert.ok(err.message.includes('Cannot read meeting file'));
        assert.ok(err.message.includes(tempFile));
        return true;
      },
    );
  });
});
