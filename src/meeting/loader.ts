import { readFileSync } from 'fs';

/**
 * Load meeting context from a markdown file.
 * The file contents are injected into the AI system prompt as-is.
 *
 * @param meetingPath - Path to the meeting markdown file
 * @returns The file contents as a string
 * @throws Error if the file cannot be read
 */
export function loadMeetingContext(meetingPath: string): string {
  try {
    return readFileSync(meetingPath, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read meeting file: ${meetingPath}: ${(err as Error).message}`);
  }
}
