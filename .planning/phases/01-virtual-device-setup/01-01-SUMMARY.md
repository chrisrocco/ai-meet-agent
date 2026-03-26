---
phase: 01-virtual-device-setup
plan: "01"
subsystem: infra
tags: [typescript, zod, node22, esm, config, platform-detection]

# Dependency graph
requires: []
provides:
  - "Node.js/TypeScript ESM project with zod and fluent-ffmpeg dependencies"
  - "ConfigSchema and Config type for typed config loading with Zod defaults"
  - "loadConfig() function: reads config.json, validates with Zod, throws on invalid input"
  - "detectPlatform() function: reads /proc/version, returns 'wsl2' or 'native-linux'"
  - "6 passing tests covering config defaults, validation errors, and platform detection"
affects: [02-virtual-device-setup, 03-virtual-device-setup, 04-virtual-device-setup, 05-ai-audio-pipeline]

# Tech tracking
tech-stack:
  added: [zod@3.23.8, fluent-ffmpeg@2.1.3, typescript@5.4.0, tsx@4.21.0]
  patterns:
    - "ESM-native TypeScript project with NodeNext module resolution"
    - "Zod schemas with .default({}) on nested objects to enable full cascading defaults"
    - "Optional path parameter on I/O functions (loadConfig, detectPlatform) for testability"

key-files:
  created:
    - package.json
    - tsconfig.json
    - config.json
    - src/config/schema.ts
    - src/config/loader.ts
    - src/platform/detect.ts
    - src/config/schema.test.ts
    - src/platform/detect.test.ts
  modified: []

key-decisions:
  - "Used tsx for test runner instead of --experimental-strip-types: tsx resolves .js imports to .ts files in ESM, while Node's strip-types flag does not"
  - "Corrected tsconfig module from 'ESNodeNext' to 'NodeNext': ESNodeNext is not a valid TypeScript module value"
  - "Added .default({}) to nested Zod objects (camera/mic/sink) so empty {} config cascades defaults to all leaf fields"
  - "detectPlatform accepts optional procVersionPath parameter for testability without /proc/version dependency"

patterns-established:
  - "Testability via optional path parameters: I/O functions accept optional file path args so tests inject temp files"
  - "Zod .default({}) pattern: apply to every nested object layer, not just the top level"
  - "tsx for running TypeScript tests: use npx tsx --test src/**/*.test.ts"

requirements-completed: [PLAT-01, PLAT-02]

# Metrics
duration: 2min
completed: 2026-03-26
---

# Phase 1 Plan 01: Project Bootstrap Summary

**Node.js/TypeScript ESM project with Zod config validation and /proc/version-based platform detection (WSL2 vs native Linux)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-26T02:09:18Z
- **Completed:** 2026-03-26T02:11:50Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Bootstrapped Node.js 22 ESM TypeScript project with all required dependencies
- Implemented typed config loading with Zod schema, full cascading defaults, and clear validation error messages
- Implemented platform detection returning 'wsl2' or 'native-linux' by reading /proc/version
- All 6 tests pass covering: valid config, empty config defaults, missing devices key, videoNr > 63, WSL2 detection, native Linux detection

## Task Commits

Each task was committed atomically:

1. **Task 1: Initialize TypeScript project and install dependencies** - `0631723` (chore)
2. **Task 2: Config schema and platform detection (TDD RED)** - `a677bef` (test)
3. **Task 2: Config schema and platform detection (TDD GREEN)** - `0b6d5fb` (feat)

_Note: TDD tasks have two commits (test RED -> feat GREEN). No REFACTOR commit needed._

## Files Created/Modified
- `package.json` - ESM project definition with zod, fluent-ffmpeg, typescript, tsx scripts
- `tsconfig.json` - TypeScript config targeting ES2022/NodeNext (corrected from ESNodeNext)
- `config.json` - User-facing device config with default camera/mic/sink labels and IDs
- `src/config/schema.ts` - Zod ConfigSchema with nested .default({}) for full cascading defaults
- `src/config/loader.ts` - loadConfig() reads config.json, validates with safeParse, throws on error
- `src/platform/detect.ts` - detectPlatform() reads /proc/version, detects WSL2 vs native Linux
- `src/config/schema.test.ts` - 4 tests: valid config, empty config defaults, null devices, videoNr > 63
- `src/platform/detect.test.ts` - 2 tests: WSL2 detection, native Linux detection

## Decisions Made
- Used tsx as the test runner instead of Node's `--experimental-strip-types` flag because tsx properly resolves `.js` extension imports to `.ts` files in an ESM project; the strip-types flag does not.
- Fixed tsconfig `module` from `"ESNodeNext"` to `"NodeNext"` — ESNodeNext is not a recognized TypeScript module value (accepted values include NodeNext, ESNext, etc.).
- Added `.default({})` to each nested Zod object (camera, mic, sink) in addition to the parent `devices` object, enabling full cascading defaults from an empty `{}` config.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Zod schema missing nested .default({}) causing empty config to fail**
- **Found during:** Task 2 (config schema implementation, TDD GREEN phase)
- **Issue:** Plan's schema had `.default({})` only on the top-level `devices` object. When input is `{}`, Zod creates `devices: {}` but then expects camera/mic/sink keys to exist. Without `.default({})` on each nested object, the "fills in all defaults" test threw a validation error.
- **Fix:** Added `.default({})` to the camera, mic, and sink Zod objects
- **Files modified:** `src/config/schema.ts`
- **Verification:** "fills in all defaults when given an empty {} config.json" test passes
- **Committed in:** 0b6d5fb (Task 2 GREEN commit)

**2. [Rule 1 - Bug] Fixed tsconfig module value 'ESNodeNext' -> 'NodeNext'**
- **Found during:** Task 2 verification (`npm run build`)
- **Issue:** TypeScript rejected `"module": "ESNodeNext"` — not a valid module value. Valid options include `NodeNext`, `ESNext`, etc.
- **Fix:** Changed `tsconfig.json` module to `"NodeNext"`
- **Files modified:** `tsconfig.json`
- **Verification:** `npm run build` completes with no TypeScript errors
- **Committed in:** 0b6d5fb (Task 2 GREEN commit)

**3. [Rule 3 - Blocking] Switched from --experimental-strip-types to tsx for test runner**
- **Found during:** Task 2 (TDD GREEN phase, running tests)
- **Issue:** `node --experimental-strip-types --test` cannot resolve `.js` imports to `.ts` files in an ESM project. Tests import `./schema.js` (correct for ESM/NodeNext), but the runner needs actual `.ts` files.
- **Fix:** Used `npx tsx --test` (tsx@4.21.0 was already available globally). Updated `package.json` scripts to use tsx.
- **Files modified:** `package.json`
- **Verification:** All 6 tests pass with tsx test runner
- **Committed in:** 0b6d5fb (Task 2 GREEN commit)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All fixes essential for correctness. The schema default fix ensures the config system actually works. The tsconfig fix enables TypeScript compilation. The tsx fix enables test execution. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Config loading and platform detection are ready for import by plans 02-04
- `loadConfig()` and `detectPlatform()` exported from their respective modules with TypeScript types
- Project compiles cleanly; all tests pass
- Next: Plan 02 (v4l2loopback camera setup) can import `loadConfig()` for device name config and `detectPlatform()` for WSL2-specific handling

---
*Phase: 01-virtual-device-setup*
*Completed: 2026-03-26*
