---
phase: 09-error-handling-and-distribution-readiness
plan: 01
subsystem: cli
tags: [zod, error-handling, cli, commander]

requires:
  - phase: 07-foundations
    provides: AgentError hierarchy with hint/exitCode
provides:
  - Human-readable Zod error formatting with field paths in ConfigError
  - DeviceError thrown from DeviceManager with per-dependency fix hints
  - All CLI commands catch AgentError uniformly
affects: []

tech-stack:
  added: []
  patterns:
    - "Zod .issues iteration for field-level error messages instead of .format()"
    - "DeviceError aggregates failed prereq checks with install commands"

key-files:
  created: []
  modified:
    - src/config/loader.ts
    - src/config/schema.test.ts
    - src/devices/index.ts
    - src/cli/commands/start.ts
    - src/cli/commands/test-audio.ts

key-decisions:
  - "Use Zod .issues array directly instead of .format() or .flatten() for human-readable field paths"
  - "Let DeviceError propagate through existing AgentError catch in CLI commands instead of catching separately"
  - "Keep 'already started' as plain Error since it's an internal invariant, not a user-facing error"

patterns-established:
  - "Config validation errors show field.path: message format"
  - "DeviceManager throws DeviceError, CLI commands catch AgentError — no raw errors escape"

requirements-completed: [ERR-01, ERR-02, ERR-03]

duration: 4min
completed: 2026-03-26
---

# Phase 9: Error Handling — Plan 01 Summary

**All critical failure points now surface actionable messages with fix hints through the AgentError hierarchy.**

## What Changed

1. **Config loader** (`src/config/loader.ts`): Replaced `result.error.format()` with field-level messages using `result.error.issues`. Invalid config now shows `devices.camera.videoNr: Number must be less than or equal to 63` instead of a nested Zod dump.

2. **DeviceManager** (`src/devices/index.ts`): Prerequisite failure now throws `DeviceError` with aggregated dependency names and install commands, instead of `new Error('Prerequisites not met')`.

3. **CLI commands**: Removed redundant try/catch blocks in `start.ts` and `test-audio.ts`. All three commands (`start`, `list-devices`, `test-audio`) already had the AgentError catch pattern — now DeviceError flows through it correctly.

## Self-Check: PASSED

- [x] Config validation errors name field path and constraint
- [x] Prerequisite failures throw DeviceError with fix hints
- [x] All 3 CLI commands catch AgentError uniformly
- [x] No raw Error escapes to users as stack trace
- [x] 12/12 config tests pass, 18/18 error tests pass
