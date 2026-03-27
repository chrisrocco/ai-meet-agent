---
phase: 07-foundations
plan: 01
subsystem: errors
tags: [typescript, error-handling, class-hierarchy]

requires:
  - phase: none
    provides: none
provides:
  - "AgentError base class with .message, .hint, .exitCode"
  - "ConfigError, DeviceError, AISessionError, AudioPipelineError subclasses"
  - "Distinct exit codes (2-5) per error category"
affects: [cli, config, devices, ai, audio]

tech-stack:
  added: []
  patterns: ["Typed error hierarchy with user-facing hints and exit codes"]

key-files:
  created: [src/errors/index.ts, src/errors/index.test.ts]
  modified: []

key-decisions:
  - "Flat hierarchy (one level of subclasses) — no need for TransientAISessionError etc."
  - "this.name = this.constructor.name in base class for correct stack traces"
  - "Default hints on subclasses with optional override parameter"

patterns-established:
  - "Error hierarchy pattern: subclass AgentError, set exitCode and default hint"
  - "All library throws use typed errors, CLI catches and exits with exitCode"

requirements-completed: []

duration: 3min
completed: 2026-03-26
---

# Phase 7: Foundations - Plan 01 Summary

**AgentError class hierarchy with 4 subclasses carrying typed exit codes and user-facing hints**

## Performance

- **Duration:** 3 min
- **Tasks:** 1 TDD feature (RED-GREEN cycle)
- **Files modified:** 2

## Accomplishments
- AgentError base class with .message, .hint, .exitCode properties
- 4 subclasses: ConfigError (2), DeviceError (3), AISessionError (4), AudioPipelineError (5)
- 18 tests covering construction, defaults, custom hints, instanceof chain, name property

## Task Commits

1. **RED: Failing tests** - `d0024cd` (test)
2. **GREEN: Implementation** - `1382739` (feat)

## Files Created/Modified
- `src/errors/index.ts` - AgentError + 4 subclasses with JSDoc
- `src/errors/index.test.ts` - 18 tests across 5 describe blocks

## Decisions Made
- Flat hierarchy (one level of subclasses) — simpler, sufficient for current needs
- Base class sets `this.name = this.constructor.name` so all subclasses get correct names automatically
- Default hints can be overridden via optional parameter for site-specific messages

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
None

## Next Phase Readiness
- Error hierarchy ready for use by all modules
- Plan 03 will use ConfigError in role-loader and AISessionError in GeminiProvider

---
*Phase: 07-foundations*
*Completed: 2026-03-26*
