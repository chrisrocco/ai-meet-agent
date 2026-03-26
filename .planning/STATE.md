# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-25)

**Core value:** Bidirectional realtime audio conversation through a Google Meet call — someone speaks, the AI twin hears and responds naturally.
**Current focus:** Phase 1 — Virtual Device Setup

## Current Position

Phase: 1 of 5 (Virtual Device Setup)
Plan: 2 of 4 in current phase
Status: In progress
Last activity: 2026-03-26 — Plan 01-02 complete (native Linux device layer: prerequisites, virtual camera, virtual audio, DeviceManager)

Progress: [██░░░░░░░░] 10%

## Performance Metrics

**Velocity:**
- Total plans completed: 2
- Average duration: 2 min
- Total execution time: 0.07 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-virtual-device-setup | 2 | 4 min | 2 min |

**Recent Trend:**
- Last 5 plans: 01-01 (2 min), 01-02 (2 min)
- Trend: steady

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Pre-Phase 1]: WSL2 browser environment decision is the highest-risk unknown — must be resolved before any pipeline code. Options: Chrome inside WSL2 via WSLg, or Chrome on Windows with VB-Cable + OBS Virtual Camera bridges.
- [Pre-Phase 4]: Gemini Live API package name and Node.js server-side availability must be verified against current docs before Phase 4 planning begins. Fallback is STT+LLM+TTS (latency implications).
- [01-01]: Use tsx as test runner (not Node --experimental-strip-types) — tsx resolves .js -> .ts imports in ESM projects.
- [01-01]: Zod nested .default({}) must be applied at every object level, not just the top-level, for full cascading defaults.
- [01-01]: tsconfig module must be "NodeNext" not "ESNodeNext" (ESNodeNext is not a valid TS value).
- [01-02]: Added declaration: true to tsconfig.json — .d.ts files required for TypeScript consumers importing device modules.
- [01-02]: DeviceManager.startup() throws on prereq failure — callers must handle failure path explicitly.
- [01-02]: Virtual mic uses media.class=Audio/Source/Virtual so Chrome exposes it as microphone input, not monitor.

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 1]: v4l2loopback may require custom WSL2 kernel compilation — standard `apt install v4l2loopback-dkms` + `modprobe` may fail silently. Verify in Phase 1 before writing pipeline code.
- [Phase 4]: Gemini Live API (`@google/genai`) — package name, Node.js server-side support, audio format requirements, and session limits need verification against current docs before coding starts.

## Session Continuity

Last session: 2026-03-26
Stopped at: Completed 01-virtual-device-setup plan 01-02 (native Linux device layer: prerequisites, virtual camera, virtual audio, DeviceManager)
Resume file: None
