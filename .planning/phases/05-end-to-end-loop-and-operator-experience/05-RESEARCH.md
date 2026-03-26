# Phase 5: End-to-End Loop and Operator Experience - Research

**Researched:** 2026-03-25
**Domain:** CLI orchestration, meeting context injection, operator audio monitoring, live transcription
**Confidence:** HIGH

## Summary

Phase 5 wires together all existing subsystems (devices, audio pipeline, AI session, video feed) into a single CLI command with per-meeting context injection, conversation memory, operator audio monitoring, and live transcript logging. The codebase is mature — all subsystems already exist and follow consistent EventEmitter patterns. The work is primarily integration and extension rather than greenfield.

The key technical challenges are: (1) parsing CLI args and loading an optional meeting markdown file, (2) extending `buildSystemPrompt()` to include meeting context, (3) extracting text events from Gemini Live API responses for transcript, (4) mixing captured + AI audio for operator monitoring via a separate playback stream, and (5) orchestrating all of this from a single `npm run start` command.

**Primary recommendation:** Build this in 3-4 focused plans: meeting context + CLI args, transcript writer + text event extraction, operator audio monitor, and final integration/startup orchestration.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Separate markdown file for per-meeting context (agenda, attendee bios, notes)
- Path passed via `--meeting` CLI flag
- Free-form markdown with heading sections (## Agenda, ## Attendees, etc.)
- File is optional — system works without it, using persona-only prompt
- Write transcript to `./transcript.log` in working directory
- Operator runs `tail -f transcript.log` in a separate terminal
- Labeled lines: `[Participant] Hello...` / `[AI:PersonaName] Hi there...`
- Source participant speech text from Gemini text events (request TEXT+AUDIO modality)
- No timestamps — keep it simple
- Invocation via `npm run start -- --config <path> --meeting <path>`
- Minimal flags: `--config` (config file) and `--meeting` (meeting context file) only
- Config is optional — all fields have Zod defaults, running without --config uses defaults
- Meeting file is optional — omitting it runs with persona-only prompt
- Fail if critical path is broken: if audio pipeline or AI session can't start, fail the whole process. Video-only failures still degrade gracefully.
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CONV-02 | Per-meeting context injection (agenda, attendee bios prepended to system prompt) | Meeting markdown loader + buildSystemPrompt extension |
| CONV-03 | Conversation memory within session — AI remembers earlier parts of the call | Native to Gemini Live API session — stateful WebSocket maintains conversation context |
| OPER-01 | Operator can monitor the call from behind the browser (hear participants + AI) | Operator audio monitor mixing capture + AI audio to default output |
| OPER-02 | Live transcript display showing what participants said and what AI responded | Transcript writer + Gemini TEXT modality extraction |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @google/genai | ^1.46.0 | Gemini Live API (already installed) | TEXT+AUDIO modality for transcript text events |
| zod | ^3.23.8 | Config schema validation (already installed) | Extend for meeting config fields |
| node:fs | built-in | Read meeting markdown file, write transcript log | Standard Node.js file I/O |
| node:process | built-in | CLI argument parsing (process.argv) | No external arg parser needed for 2 flags |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:child_process | built-in | Spawn ffplay/pacat for operator audio playback | Operator monitor on native Linux |
| node:stream | built-in | PassThrough for audio mixing/teeing | Duplicating audio streams to monitor |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual argv parsing | commander/yargs | Overkill for 2 optional flags — project convention is minimal deps |
| ffplay for monitor | PulseAudio loopback module | PulseAudio loopback is more elegant but less portable; ffplay works on both native and WSL2 |
| File-based transcript | WebSocket/terminal UI | File + tail -f is simpler and matches user decision |

**Installation:** No new packages needed. All dependencies are already installed or built-in.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── config/
│   ├── schema.ts          # Extend with meeting field
│   └── loader.ts          # Extend with CLI arg parsing
├── ai/
│   ├── persona.ts         # Extend buildSystemPrompt with meeting context
│   └── session.ts         # Add TEXT modality, emit 'text' events
├── meeting/
│   └── loader.ts          # NEW: Read and validate meeting markdown
├── transcript/
│   └── writer.ts          # NEW: Append-only transcript log writer
├── monitor/
│   └── operator-audio.ts  # NEW: Mix + play audio for operator
└── index.ts               # Wire everything together, CLI args, critical path enforcement
```

### Pattern 1: CLI Argument Parsing
**What:** Parse `--config` and `--meeting` from process.argv manually
**When to use:** Two optional flags with simple string values
**Example:**
```typescript
function parseArgs(argv: string[]): { configPath?: string; meetingPath?: string } {
  const args: { configPath?: string; meetingPath?: string } = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--config' && argv[i + 1]) {
      args.configPath = argv[++i];
    } else if (argv[i] === '--meeting' && argv[i + 1]) {
      args.meetingPath = argv[++i];
    }
  }
  return args;
}
```

### Pattern 2: Meeting Context Injection into System Prompt
**What:** Read meeting markdown and append to persona system prompt
**When to use:** When `--meeting` path provided
**Example:**
```typescript
export function buildSystemPrompt(persona: Config['persona'], meetingContext?: string): string {
  const parts: string[] = [];
  // ... existing persona fields ...
  if (meetingContext) {
    parts.push('\n## Meeting Context\n');
    parts.push(meetingContext);
  }
  return parts.join('\n');
}
```

### Pattern 3: Gemini TEXT+AUDIO Modality
**What:** Request both TEXT and AUDIO response modalities so the API returns transcription text alongside audio
**When to use:** For transcript logging
**Example:**
```typescript
// In session.ts connect config:
responseModalities: [Modality.AUDIO, Modality.TEXT],
// In handleMessage:
if (part.text) {
  this.emit('text', part.text);
}
```

### Pattern 4: Audio Tee for Operator Monitor
**What:** Duplicate PCM audio data to both the virtual mic output AND a local playback stream
**When to use:** Operator monitoring — hear both participant audio and AI responses
**Example:**
```typescript
// Tee pattern: write to both virtual mic and monitor playback
session.on('audio', (pcm16k: Buffer) => {
  outputStream.write(pcm16k);      // Virtual mic (into Meet)
  monitor.writeAI(pcm16k);         // Operator monitor
});
captureStream.on('data', (chunk: Buffer) => {
  session.sendAudio(chunk);         // To AI
  monitor.writeParticipant(chunk);  // Operator monitor
});
```

### Pattern 5: Operator Audio Playback via ffplay
**What:** Spawn ffplay reading PCM from stdin for local audio playback
**When to use:** Operator monitoring on both native Linux and WSL2
**Example:**
```typescript
// ffplay reads raw PCM from stdin and plays to default audio output
const proc = spawn('ffplay', [
  '-f', 's16le', '-ar', '16000', '-ac', '1',
  '-nodisp', '-autoexit', '-i', 'pipe:0'
], { stdio: ['pipe', 'ignore', 'ignore'] });
```

### Anti-Patterns to Avoid
- **Joining the call as a second participant for monitoring:** User explicitly said "without joining the call as a second participant" — use local playback only
- **Complex audio mixing with ffmpeg:** Don't spawn ffmpeg to mix two streams. Use a simple in-process buffer interleaving — write both capture and AI audio to the same ffplay stdin
- **Overcomplicating transcript format:** No timestamps, no metadata, just labeled lines per user decision

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CLI arg parsing | Full arg parser framework | Manual argv loop | Only 2 optional flags; commander/yargs is overkill |
| Conversation memory | Custom context window management | Gemini Live API session state | Live API maintains conversation context natively over the WebSocket session |
| Audio playback | Custom audio output library | ffplay subprocess | ffplay handles audio output portably; available everywhere ffmpeg is |

**Key insight:** Conversation memory (CONV-03) is free — the Gemini Live API maintains session state over the WebSocket connection. No custom memory management needed.

## Common Pitfalls

### Pitfall 1: Forgetting to Request TEXT Modality
**What goes wrong:** Without TEXT modality, Gemini Live API only returns audio data — no text for transcription
**Why it happens:** Current code requests `[Modality.AUDIO]` only
**How to avoid:** Change to `[Modality.AUDIO, Modality.TEXT]` in session.connect() config
**Warning signs:** Transcript shows AI responses but no participant text, or vice versa

### Pitfall 2: Critical Path Not Enforced
**What goes wrong:** System starts with broken audio/AI but appears to work (video-only mode)
**Why it happens:** Current index.ts has try/catch with warn-and-continue for ALL subsystems
**How to avoid:** After audio pipeline and AI session start, check both are active. If either is null, throw fatal error and exit.
**Warning signs:** System running but no AI responses

### Pitfall 3: ffplay Blocking on Empty stdin
**What goes wrong:** ffplay hangs or exits immediately if no audio data arrives quickly
**Why it happens:** ffplay expects continuous audio; gaps cause buffer underruns
**How to avoid:** Feed silence (zero-filled buffers) when no audio is flowing, or use `-fflags +nobuffer` flag
**Warning signs:** Choppy or clicking audio from operator monitor

### Pitfall 4: Transcript File Handle Leaks
**What goes wrong:** Transcript file descriptor not closed on shutdown
**Why it happens:** appendFileSync is safe but createWriteStream needs explicit close
**How to avoid:** Use appendFileSync for simplicity (low write frequency), or ensure stream is closed in shutdown handler
**Warning signs:** File not flushed on process exit

### Pitfall 5: loadConfig Must Handle Missing Config File Gracefully
**What goes wrong:** Current loadConfig throws if config.json doesn't exist
**Why it happens:** User decision says "Config is optional — running without --config uses defaults"
**How to avoid:** If no --config flag and no config.json exists, return ConfigSchema.parse({}) for full defaults
**Warning signs:** "Cannot read config file" error when running without --config

## Code Examples

### Meeting Markdown Loader
```typescript
import { readFileSync } from 'fs';

export function loadMeetingContext(meetingPath: string): string {
  try {
    return readFileSync(meetingPath, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read meeting file: ${meetingPath}: ${(err as Error).message}`);
  }
}
```

### Transcript Writer
```typescript
import { appendFileSync, writeFileSync } from 'fs';

export class TranscriptWriter {
  constructor(private readonly path: string) {
    writeFileSync(path, ''); // Clear/create file on start
  }

  writeParticipant(text: string): void {
    appendFileSync(this.path, `[Participant] ${text}\n`);
  }

  writeAI(personaName: string, text: string): void {
    appendFileSync(this.path, `[AI:${personaName}] ${text}\n`);
  }
}
```

### Operator Audio Monitor
```typescript
import { spawn, type ChildProcess } from 'child_process';

export class OperatorAudioMonitor {
  private proc: ChildProcess | null = null;

  start(platform: 'native' | 'wsl2'): void {
    const ffplay = platform === 'wsl2' ? 'ffplay.exe' : 'ffplay';
    this.proc = spawn(ffplay, [
      '-f', 's16le', '-ar', '16000', '-ac', '1',
      '-nodisp', '-autoexit', '-i', 'pipe:0',
    ], { stdio: ['pipe', 'ignore', 'ignore'] });
  }

  write(pcmChunk: Buffer): void {
    if (this.proc?.stdin && !this.proc.stdin.destroyed) {
      this.proc.stdin.write(pcmChunk);
    }
  }

  stop(): void {
    if (this.proc) {
      this.proc.stdin?.end();
      this.proc.kill('SIGTERM');
      this.proc = null;
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Gemini STT + separate LLM + TTS | Gemini Live API (native audio) | 2024-2025 | Single WebSocket, sub-2s latency |
| Manual conversation context management | Live API session state | Native to API | No custom memory code needed |
| AUDIO-only modality | AUDIO+TEXT dual modality | Supported in @google/genai | Enables transcript without separate STT |

**Deprecated/outdated:**
- None relevant — all existing patterns are current

## Open Questions

1. **Participant speech text from Gemini**
   - What we know: Gemini Live API can return TEXT alongside AUDIO when both modalities are requested. The `serverContent.modelTurn.parts` can contain both `inlineData` (audio) and `text` (transcription).
   - What's unclear: Whether Gemini transcribes the *input* audio (participant speech) or only provides text for its *own* responses. The participant text may come as a separate event type.
   - Recommendation: Request TEXT+AUDIO modality. If participant text is not provided by the API, the transcript will only show AI responses (still valuable). Log participant audio level instead as fallback. This can be enhanced in v2 with a separate STT service.

2. **ffplay availability on WSL2**
   - What we know: WSL2 path uses `ffplay.exe` (Windows binary) for video already. Config has `wsl2.ffplayPath`.
   - What's unclear: Whether ffplay.exe can receive piped audio from WSL2 stdin
   - Recommendation: Use the same `wsl2.ffplayPath` config value. If ffplay fails, operator monitor degrades gracefully (warn, don't crash).

## Sources

### Primary (HIGH confidence)
- Codebase analysis: src/ai/session.ts, src/ai/persona.ts, src/config/schema.ts, src/index.ts — direct inspection of existing patterns
- @google/genai package (installed ^1.46.0) — Modality enum includes AUDIO and TEXT

### Secondary (MEDIUM confidence)
- Gemini Live API TEXT+AUDIO dual modality behavior — based on API design patterns and Modality enum availability

### Tertiary (LOW confidence)
- ffplay stdin piping from WSL2 to Windows audio — untested in this specific configuration

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, extending existing code
- Architecture: HIGH - follows established project patterns (EventEmitter, factory, platform branching)
- Pitfalls: HIGH - identified from direct codebase analysis of current error handling patterns

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable domain, no fast-moving dependencies)
