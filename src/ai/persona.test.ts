import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt } from './persona.js';

describe('buildSystemPrompt', () => {
  it('includes name and role for all-fields persona', () => {
    const prompt = buildSystemPrompt({
      name: 'Alice',
      role: 'Technical Lead',
      background: 'Expert in distributed systems',
      instructions: 'Always cite sources.',
      introduceOnStart: true,
    });
    assert.ok(prompt.includes('Your name is Alice.'));
    assert.ok(prompt.includes('Your role is: Technical Lead.'));
    assert.ok(prompt.includes('Background: Expert in distributed systems'));
    assert.ok(prompt.includes('Always cite sources.'));
    assert.ok(prompt.includes('introduce yourself'));
  });

  it('returns minimal prompt with defaults only', () => {
    const prompt = buildSystemPrompt({
      name: 'AI Assistant',
      role: 'Meeting Participant',
      background: '',
      instructions: '',
      introduceOnStart: true,
    });
    assert.ok(prompt.includes('Your name is AI Assistant.'));
    assert.ok(prompt.includes('Your role is: Meeting Participant.'));
    assert.ok(!prompt.includes('Background:'));
    assert.ok(prompt.includes('introduce yourself'));
  });

  it('includes introduction instruction when introduceOnStart is true', () => {
    const prompt = buildSystemPrompt({
      name: 'Bot',
      role: 'Helper',
      background: '',
      instructions: '',
      introduceOnStart: true,
    });
    assert.ok(prompt.includes('When the conversation begins, briefly introduce yourself.'));
  });

  it('omits introduction instruction when introduceOnStart is false', () => {
    const prompt = buildSystemPrompt({
      name: 'Bot',
      role: 'Helper',
      background: '',
      instructions: '',
      introduceOnStart: false,
    });
    assert.ok(!prompt.includes('introduce yourself'));
  });

  it('omits background and instructions when empty', () => {
    const prompt = buildSystemPrompt({
      name: 'Bot',
      role: 'Helper',
      background: '',
      instructions: '',
      introduceOnStart: false,
    });
    assert.ok(!prompt.includes('Background:'));
    // Should only have name and role lines
    const lines = prompt.split('\n').filter(l => l.trim());
    assert.equal(lines.length, 2);
  });
});
