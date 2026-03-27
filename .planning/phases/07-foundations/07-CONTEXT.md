# Phase 7: Foundations - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Infrastructure that the CLI layer depends on — typed error hierarchy (`AgentError`), AI provider interface (`RealtimeAudioProvider`), GeminiProvider adapter wrapping existing session, and role file loader (`--role <path>`). No CLI code in this phase — that's Phase 8.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

User deferred all gray areas to Claude's judgment with the guidance: **"Use your best judgement, and keep good docs."**

The following areas are all Claude's discretion:

**Error shape:**
- What properties `AgentError` carries (message, hint, exitCode, etc.)
- Error subclass hierarchy design
- How errors map to exit codes
- Currently: plain `new Error('message')` throughout codebase

**Provider interface:**
- Method names and signatures for `RealtimeAudioProvider`
- Event contract shape
- Config abstraction
- Currently: `GeminiLiveSession` uses EventEmitter with `connect()`, `sendAudio(Buffer)`, `disconnect()`, events: `audio`, `text`, `connected`, `disconnected`, `error`, `latency`

**Role file format:**
- File format for `--role` files (plain text, markdown, JSON, or structured markdown)
- How role file content merges with `Config.persona` fields
- Currently: meeting loader reads raw markdown via `fs.readFile` and passes as string

**Adapter boundary:**
- How much of `GeminiLiveSession`'s API the adapter exposes vs hides
- Whether reconnection, latency stats, state tracking are part of the provider interface or Gemini-specific

**Documentation:**
- User wants good documentation — JSDoc comments on interfaces, clear README sections for new modules

</decisions>

<specifics>
## Specific Ideas

- "Keep good docs" — prioritize JSDoc on interfaces and public APIs so future contributors understand the provider contract and error hierarchy

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/meeting/loader.ts`: File loading pattern (readFile + path resolution) — template for role file loader
- `src/audio/types.ts`: Interface pattern (`AudioCapture`, `AudioOutput`) — template for `RealtimeAudioProvider`
- `src/audio/factory.ts`: Factory dispatch pattern — template for provider factory
- `src/ai/session.ts`: `GeminiLiveSession` public API — the class to wrap with adapter

### Established Patterns
- EventEmitter for async communication (session, audio, video all use it)
- Factory functions for platform dispatch (`createAudioCapture()`, `createVideoFeed()`)
- Zod schema for config validation with cascading defaults
- `import.meta.url` for project root resolution (⚠️ breaks on global install — research flagged this)

### Integration Points
- `src/index.ts` line 128-132: Where GeminiLiveSession is constructed — will use provider factory instead
- `src/config/loader.ts`: Where `--role` flag will be parsed (alongside existing `--config`, `--meeting`)
- `src/ai/index.ts`: Public API exports — will add provider interface and factory exports
- Error throw sites across all modules — will use `AgentError` subclasses

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-foundations*
*Context gathered: 2026-03-26*
