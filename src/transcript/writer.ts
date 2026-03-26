import { appendFileSync, writeFileSync } from 'fs';

/**
 * Append-only transcript log writer.
 * Writes labeled lines to a transcript file for operator review.
 * Operator runs `tail -f transcript.log` in a separate terminal.
 */
export class TranscriptWriter {
  constructor(private readonly path: string) {
    writeFileSync(path, ''); // Clear/create on start
  }

  /** Append a participant speech line. Format: [Participant] text */
  writeParticipant(text: string): void {
    appendFileSync(this.path, `[Participant] ${text}\n`);
  }

  /** Append an AI response line. Format: [AI:PersonaName] text */
  writeAI(personaName: string, text: string): void {
    appendFileSync(this.path, `[AI:${personaName}] ${text}\n`);
  }
}
