import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadRole } from './role-loader.js';
import { ConfigError } from '../errors/index.js';

describe('loadRole', () => {
  let tempDir: string;

  // Create temp dir for each test file
  it('loads markdown file as background field', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'role-test-'));
    const rolePath = join(tempDir, 'persona.md');
    writeFileSync(rolePath, '# My Persona\n\nI am an expert engineer.');

    const result = loadRole(rolePath);
    assert.equal(result.background, '# My Persona\n\nI am an expert engineer.');
    rmSync(tempDir, { recursive: true });
  });

  it('loads .txt file as background field', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'role-test-'));
    const rolePath = join(tempDir, 'persona.txt');
    writeFileSync(rolePath, 'Plain text persona description');

    const result = loadRole(rolePath);
    assert.equal(result.background, 'Plain text persona description');
    rmSync(tempDir, { recursive: true });
  });

  it('loads JSON file and returns persona fields', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'role-test-'));
    const rolePath = join(tempDir, 'persona.json');
    writeFileSync(rolePath, JSON.stringify({
      name: 'Dr. Smith',
      role: 'Technical Advisor',
      background: 'PhD in Computer Science',
      instructions: 'Be concise and direct',
    }));

    const result = loadRole(rolePath);
    assert.equal(result.name, 'Dr. Smith');
    assert.equal(result.role, 'Technical Advisor');
    assert.equal(result.background, 'PhD in Computer Science');
    assert.equal(result.instructions, 'Be concise and direct');
    rmSync(tempDir, { recursive: true });
  });

  it('throws ConfigError for non-existent file', () => {
    assert.throws(
      () => loadRole('/nonexistent/path/role.md'),
      (err: any) => {
        assert.ok(err instanceof ConfigError);
        assert.ok(err.hint.includes('--role'));
        return true;
      }
    );
  });

  it('throws ConfigError for malformed JSON', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'role-test-'));
    const rolePath = join(tempDir, 'bad.json');
    writeFileSync(rolePath, '{invalid json}}}');

    assert.throws(
      () => loadRole(rolePath),
      (err: any) => {
        assert.ok(err instanceof ConfigError);
        assert.ok(err.hint.includes('JSON'));
        return true;
      }
    );
    rmSync(tempDir, { recursive: true });
  });
});
