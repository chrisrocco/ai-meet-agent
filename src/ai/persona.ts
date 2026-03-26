import type { Config } from '../config/schema.js';

/**
 * Build a system prompt from persona configuration fields.
 * Sent to Gemini Live API as the system instruction on session start.
 *
 * @param persona - Persona configuration fields
 * @param meetingContext - Optional meeting markdown content (agenda, attendees, etc.)
 */
export function buildSystemPrompt(persona: Config['persona'], meetingContext?: string): string {
  const parts: string[] = [];

  parts.push(`Your name is ${persona.name}.`);
  parts.push(`Your role is: ${persona.role}.`);

  if (persona.background) {
    parts.push(`Background: ${persona.background}`);
  }

  if (persona.instructions) {
    parts.push(persona.instructions);
  }

  if (persona.introduceOnStart) {
    parts.push('When the conversation begins, briefly introduce yourself.');
  }

  if (meetingContext) {
    parts.push('\n## Meeting Context\n');
    parts.push(meetingContext);
  }

  return parts.join('\n');
}
