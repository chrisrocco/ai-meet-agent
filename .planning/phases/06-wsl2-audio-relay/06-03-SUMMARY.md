---
phase: 06-wsl2-audio-relay
plan: "03"
subsystem: audio
tags: [wsl2, relay, error-handling, tcp, bridge]

# Dependency graph
requires:
  - phase: 06-02
    provides: WslAudioRelayServer lifecycle integration with index.ts
provides:
  - Bridge spawn errors (ENOENT, EACCES, etc.) are logged as warnings and do not crash the app
  - Relay listening log message appears exactly once (inside class start(), not index.ts)
affects: [06-wsl2-audio-relay]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Non-fatal bridge error pattern: ChildProcess errors are console.warn'd not re-emitted — bridges auto-restart on exit"

key-files:
  created: []
  modified:
    - src/audio/wsl2-relay-server.ts
    - src/index.ts

key-decisions:
  - "Bridge error handlers use console.warn() not this.emit('error') — errors are non-fatal because bridges auto-restart on exit"
  - "Relay listening log belongs only in WslAudioRelayServer.start() — using config port, not the constant — so removed from index.ts"

patterns-established:
  - "Non-fatal bridge pattern: log warnings for child process errors rather than propagating as EventEmitter errors"

requirements-completed: [PLAT-02]

# Metrics
duration: 3min
completed: 2026-03-25
---

# Phase 6 Plan 03: Gap Closure — Bridge Error Handling Summary

**Bridge ENOENT/spawn errors converted from app-crashing re-emits to console.warn(), and duplicate relay startup log removed from index.ts**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-25T00:00:00Z
- **Completed:** 2026-03-25T00:03:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Fixed `spawnCaptureBridge()` error handler: `this.emit('error', err)` replaced with `console.warn('[AudioRelay:capture] Bridge error: ...')`
- Fixed `spawnOutputBridge()` error handler: `this.emit('error', err)` replaced with `console.warn('[AudioRelay:output] Bridge error: ...')`
- Removed duplicate `[AudioRelay] TCP relay listening on port ...` log from `src/index.ts` (still emitted once inside `WslAudioRelayServer.start()`)
- Removed now-unused `RELAY_PORT` import from `src/index.ts`
- TypeScript compiles cleanly with no errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix bridge error handlers and remove duplicate log** - `8873077` (fix)

## Files Created/Modified

- `src/audio/wsl2-relay-server.ts` - Bridge error handlers now call console.warn() instead of re-emitting fatal errors
- `src/index.ts` - Duplicate relay listening log and unused RELAY_PORT import removed

## Decisions Made

- Bridge errors are non-fatal because bridges already auto-restart on `exit` event (1s delay). An ENOENT (ffmpeg.exe not found) is a misconfiguration that should warn the operator, not crash the app. This matches the project's established pattern (video feed, audio pipeline try/catch).
- The relay listening log stays inside `WslAudioRelayServer.start()` because it uses `this.config.audio.relayPort ?? RELAY_PORT` (the configured value), whereas `index.ts` had hardcoded `RELAY_PORT`. The class log is authoritative.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 6 gap closure complete. All UAT-identified blockers fixed:
  - Test 2 (duplicate listening message) — resolved
  - Test 4 (relay failure non-fatal / bridge ENOENT crashes app) — resolved
- No further work scheduled for Phase 6.

---
*Phase: 06-wsl2-audio-relay*
*Completed: 2026-03-25*
