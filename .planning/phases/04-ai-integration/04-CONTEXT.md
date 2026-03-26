# Phase 4: AI Integration - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the Gemini Live WebSocket API between the existing audio capture and output streams. Audio chunks from Meet participants are sent to Gemini Live, and AI audio responses are received and played through the virtual microphone. Includes reconnection logic, persona configuration, and latency instrumentation. Per-meeting context injection and conversation memory are Phase 5.

</domain>

<decisions>
## Implementation Decisions

### WebSocket Session Lifecycle
- API key via `GEMINI_API_KEY` environment variable only — no secrets in config files
- Auto-reconnect with exponential backoff, limited to 3-5 retries before stopping and notifying operator
- Distinguish transient errors (network) from permanent errors (auth/quota) — don't retry permanent failures
- During reconnection, virtual mic goes silent — no buffering or replay of missed audio
- Operator notified when retries exhausted

### Audio Chunking & Format
- Stream playback as chunks arrive — no buffering full responses. Play AI audio through virtual mic immediately for natural conversational flow
- Always stream audio to the API regardless of silence — let the API handle VAD/silence detection
- Audio format: existing 16kHz/16-bit/mono PCM from AudioCapture is the starting point

### Persona & System Prompt
- Persona configuration lives in the main config file (Zod schema) as a `persona` section alongside devices/audio/video
- Fields: `name` (string), `role` (string), `background` (string), `instructions` (freeform string for behavioral guidance)
- Configurable `introduceOnStart` boolean — controls whether AI introduces itself when it first speaks
- Sensible defaults for all fields so it works out of the box with minimal config (e.g., name: "AI Assistant", role: "Meeting Participant")
- System prompt constructed from persona fields and sent on WebSocket session start

### Latency & Instrumentation
- Measure round-trip latency via timestamp markers: mark when audio chunk leaves capture, measure when first AI response byte arrives
- Moderate logging level: connection events, reconnections, latency per exchange, audio level warnings
- Periodic console summary line printed every N seconds showing latency stats — operator sees it live
- Log a warning when round-trip exceeds 2s threshold

### Claude's Discretion
- WebSocket session startup sequence (handshake vs immediate streaming) — follow Gemini Live API behavior
- Optimal audio chunk size for the API — balance between latency and efficiency
- Audio format conversion strategy if Gemini expects different format than 16kHz/16-bit/mono
- Latency summary interval and formatting
- Exact backoff timing for reconnection attempts
- Default persona values

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AudioCapture` interface (src/audio/types.ts): Returns `Readable` stream, emits 'level' and 'reconnecting' events — direct input to WebSocket sender
- `AudioOutput` interface (src/audio/types.ts): Accepts `Writable` stream — direct target for AI response audio
- `AUDIO_FORMAT` constant (src/audio/types.ts): 16kHz, 16-bit signed LE, mono — already matches voice AI expectations
- `ConfigSchema` (src/config/schema.ts): Zod schema — extend with `persona` and `ai` sections
- Audio factory pattern (src/audio/factory.ts): Creates platform-appropriate capture/output instances

### Established Patterns
- Zod schemas with `.default({})` for optional config sections — persona section should follow this pattern
- EventEmitter-based interfaces with typed events ('error', 'reconnecting', 'level')
- Platform detection (src/platform/detect.ts) for WSL2 vs native branching
- Separate capture/output paths with architectural isolation (no echo feedback)

### Integration Points
- Audio capture stream → new WebSocket sender module (pipe Readable to WS)
- WebSocket receiver → audio output stream (pipe WS responses to Writable)
- Config loader (src/config/loader.ts) → extended schema with persona/AI fields
- CLI entry point (src/cli/) → new commands or flags for AI session management

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-ai-integration*
*Context gathered: 2026-03-25*
