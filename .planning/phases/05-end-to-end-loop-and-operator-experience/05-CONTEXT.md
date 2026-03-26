# Phase 5: End-to-End Loop and Operator Experience - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the full bidirectional AI conversation loop for a live Google Meet call. Add per-meeting context injection via markdown files, conversation memory within a session, operator audio monitoring (hear both sides locally), and a live transcript log. Provide a single CLI command that starts everything.

</domain>

<decisions>
## Implementation Decisions

### Meeting context format
- Separate markdown file for per-meeting context (agenda, attendee bios, notes)
- Path passed via `--meeting` CLI flag
- Free-form markdown with heading sections (## Agenda, ## Attendees, etc.)
- File is optional — system works without it, using persona-only prompt
- Claude's discretion on how to inject meeting content into the system prompt

### Live transcript display
- Write transcript to `./transcript.log` in working directory
- Operator runs `tail -f transcript.log` in a separate terminal
- Labeled lines: `[Participant] Hello...` / `[AI:PersonaName] Hi there...`
- Source participant speech text from Gemini text events (request TEXT+AUDIO modality)
- No timestamps — keep it simple

### Single-command startup
- Invocation via `npm run start -- --config <path> --meeting <path>`
- Minimal flags: `--config` (config file) and `--meeting` (meeting context file) only
- Config is optional — all fields have Zod defaults, running without --config uses defaults
- Meeting file is optional — omitting it runs with persona-only prompt
- Fail if critical path is broken: if audio pipeline or AI session can't start, fail the whole process. Video-only failures still degrade gracefully.

### Operator audio monitoring
- Mix captured participant audio + AI response audio and play through operator's default speakers/headphones
- Separate local playback stream — not through the virtual mic
- On by default — operator always hears the call when running
- Can mute via system volume controls

### Claude's Discretion
- How meeting markdown is parsed and injected into system prompt
- Audio mixing implementation for operator monitoring (ffplay, PulseAudio loopback, or direct playback)
- Conversation memory approach (likely native to Gemini Live session state)
- Transcript log rotation / file management
- Startup banner and status output format

</decisions>

<specifics>
## Specific Ideas

- Meeting file format should feel natural to write — just a markdown doc with headings, not structured YAML
- Critical path failure = audio + AI. Video failure is non-fatal
- Transcript should be readable by a human reviewing after the meeting

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `buildSystemPrompt()` in `src/ai/persona.ts`: Assembles persona fields into system instruction string — extend to include meeting context
- `ConfigSchema` in `src/config/schema.ts`: Zod schema with defaults — add meeting-related fields
- `GeminiLiveSession` in `src/ai/session.ts`: Full WebSocket lifecycle with reconnection, audio events, latency tracking — add text event handling for transcript
- `loadConfig()` in `src/config/loader.ts`: Config loading — extend to accept CLI-provided path
- Audio capture/output pipeline in `src/audio/`: Capture stream provides participant audio, output stream provides AI audio — both needed for operator monitoring mix

### Established Patterns
- EventEmitter pattern for all subsystems (capture, output, session, video feed)
- Graceful degradation with console.warn for non-critical failures
- Platform branching via `detectPlatform()` for native vs WSL2 paths
- Zod schemas with `.default({})` for optional config sections

### Integration Points
- `src/index.ts` main() function: Orchestrates all subsystems — needs CLI arg parsing, meeting file loading, transcript writer, and operator audio monitor wired in
- `GeminiLiveSession` callbacks: `onmessage` handler currently only processes audio — needs to extract text events too
- Config flow: loadConfig() → schema validation → subsystem constructors

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-end-to-end-loop-and-operator-experience*
*Context gathered: 2026-03-25*
