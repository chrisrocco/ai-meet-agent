import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectPlatform } from './detect.js';

function makeProcVersion(content: string): string {
  const dir = join(tmpdir(), `proc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'version');
  writeFileSync(path, content, 'utf8');
  return path;
}

describe('detectPlatform', () => {
  it("returns 'wsl2' when /proc/version contains 'microsoft'", () => {
    const path = makeProcVersion('Linux version 5.15.167.4-microsoft-standard-WSL2 (gcc version 11.4.0)');
    const result = detectPlatform(path);
    assert.equal(result, 'wsl2');
  });

  it("returns 'native-linux' when /proc/version does not contain 'microsoft' or 'wsl'", () => {
    const path = makeProcVersion('Linux version 6.8.0-57-generic (buildd@lcy02-amd64-059) (gcc version 13.2.0)');
    const result = detectPlatform(path);
    assert.equal(result, 'native-linux');
  });
});
