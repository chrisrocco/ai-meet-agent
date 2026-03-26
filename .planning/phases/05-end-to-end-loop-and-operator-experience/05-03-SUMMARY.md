---
phase: 05-end-to-end-loop-and-operator-experience
plan: 03
subsystem: integration, monitor
tags: [ffplay, operator-monitor, cli, critical-path, e2e]

requires:
  - phase: 05-end-to-end-loop-and-operator-experience
    provides: parseCliArgs, loadMeetingContext, buildSystemPrompt(meetingContext), TranscriptWriter, session text events
provides:
  - OperatorAudioMonitor class for local audio playback via ffplay
  - Fully integrated index.ts with single-command startup
  - Critical path enforcement (audio + AI must succeed)
  - Graceful video degradation
  - CLI --config and --meeting flags wired end-to-end
  - Transcript logging wired to AI text events
  - Operator monitor receiving both participant and AI audio
affects: []

tech-stack:
  added: []
  patterns:
    - "Critical path enforcement: audio and AI failures are fatal (process.exit(1)), video is non-fatal"
    - "Audio tee pattern: captureStream.on('data') writes to both AI and monitor"
    - "ffplay subprocess for local audio playback: -f s16le -ar 16000 -ac 1 -nodisp"
    - "DI pattern for spawn function: constructor accepts optional SpawnFunction for testing"

key-files:
  created:
    - src/monitor/operator-audio.ts
    - src/monitor/operator-audio.test.ts
  modified:
    - src/index.ts

key-decisions:
  - "Audio pipeline failure is FATAL — previously was warn-and-continue"
  - "AI session failure is FATAL — previously was warn-and-continue"
  - "Missing GEMINI_API_KEY is FATAL — previously was warn-and-continue"
  - "Video failure remains non-fatal (graceful degradation)"
  - "Monitor stop() in shutdown before audio stop — prevents writes to stopped monitor"
  - "ffplay with -loglevel quiet to suppress noisy output"

patterns-established:
  - "Operator audio monitor: ffplay subprocess with DI spawn function"
  - "Critical path pattern: try/catch with process.exit(1) for required subsystems"
  - "Startup banner pattern: clean summary of active components after all subsystems started"

requirements-completed:
  - OPER-01
  - CONV-02
  - CONV-03
  - OPER-02

duration: 4min
completed: 2026-03-25
---

# Phase 5 Plan 03: Operator Audio Monitor and Full Integration Summary

**OperatorAudioMonitor with ffplay playback, complete end-to-end wiring with CLI args, meeting context, transcript, critical path enforcement**

## Performance

- **Duration:** 4 min
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- OperatorAudioMonitor plays both participant and AI audio through local speakers via ffplay
- index.ts fully integrated: CLI args, meeting context, transcript, monitor, critical path
- Audio and AI failures are now fatal (critical path enforcement)
- Video failure remains non-fatal (graceful degradation per user decision)
- 100 tests pass across full test suite

## Task Commits

1. **Task 1: Operator audio monitor** - `f4f3922`
2. **Task 2: Wire complete end-to-end system** - `6ca1836`

## Files Created/Modified
- `src/monitor/operator-audio.ts` - OperatorAudioMonitor with ffplay playback
- `src/monitor/operator-audio.test.ts` - Tests with DI spawn function
- `src/index.ts` - Full integration of all Phase 5 features

## Decisions Made
- Audio and AI failures changed from non-fatal warnings to fatal errors (per user decision: "Fail if critical path is broken")
- Monitor receives both audio streams via tee pattern (no separate mixing step)
- Shutdown order: session -> monitor -> capture -> output -> relay -> video -> manager

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
- Import error in test (EventEmitter from 'node:stream' vs 'node:events') — fixed immediately

## Next Phase Readiness
- Phase 5 complete — all requirements satisfied
- System ready for live testing with `npm run start -- --config config.json --meeting agenda.md`

---
*Phase: 05-end-to-end-loop-and-operator-experience*
*Completed: 2026-03-25*
