---
phase: 01-virtual-device-setup
plan: "02"
subsystem: infra
tags: [typescript, ffmpeg, v4l2loopback, pactl, virtual-camera, virtual-audio, child_process]

# Dependency graph
requires:
  - phase: 01-virtual-device-setup
    plan: "01"
    provides: "Config type (src/config/schema.ts) used by DeviceManager constructor"
provides:
  - "checkPrerequisites() validates v4l2loopback, /dev/videoN, pactl, ffmpeg with runnable fix commands"
  - "VirtualCamera class: startTestPattern() spawns ffmpeg to v4l2loopback, stop() sends SIGTERM"
  - "VirtualAudioDevices class: create() loads pactl null-sink + virtual mic modules, cleanup() unloads them"
  - "DeviceManager class: startup() orchestrates prereqs + audio + camera, shutdown() cleans up all"
  - "TypeScript .d.ts declarations for all four device modules"
affects: [03-virtual-device-setup, 04-virtual-device-setup, 02-browser-control, 03-audio-pipeline, 05-ai-audio-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Node.js child_process.spawn for long-running subprocesses (ffmpeg): store ChildProcess ref, kill with SIGTERM"
    - "pactl module lifecycle: load-module returns ID, unload-module by ID — store IDs for cleanup"
    - "DeviceManager startup/shutdown pattern: check prereqs first, throw on failure, register SIGINT/SIGTERM for cleanup"

key-files:
  created:
    - src/devices/prerequisites.ts
    - src/devices/virtual-camera.ts
    - src/devices/virtual-audio.ts
    - src/devices/index.ts
  modified:
    - tsconfig.json

key-decisions:
  - "Added declaration: true to tsconfig.json so dist/ produces .d.ts files — required for TypeScript consumers importing device modules"
  - "DeviceManager.startup() throws on prereq failure rather than returning partial success — caller must handle and display fix instructions"
  - "VirtualCamera.stop() sets ffmpegProcess=null immediately before SIGTERM, preventing double-stop race on exit event"

patterns-established:
  - "Prerequisite gating pattern: checkPrerequisites() returns structured result with per-check fix commands; DeviceManager.startup() throws if !prereqs.ok"
  - "pactl null-sink virtual mic: use media.class=Audio/Source/Virtual so Chrome exposes it as a microphone, not a monitor"
  - "Safe cleanup pattern: check null before unload, catch errors and log as warnings (never throw in cleanup paths)"

requirements-completed: [VDEV-01, VDEV-02, PLAT-01]

# Metrics
duration: 2min
completed: 2026-03-26
---

# Phase 1 Plan 02: Native Linux Device Layer Summary

**ffmpeg v4l2loopback camera feed and pactl virtual audio devices wrapped in a TypeScript DeviceManager with prerequisite gating and SIGTERM cleanup**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-26T02:14:04Z
- **Completed:** 2026-03-26T02:16:01Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Implemented checkPrerequisites() with four checks (v4l2loopback, /dev/videoN, pactl, ffmpeg) each with a runnable fix command
- Implemented VirtualCamera spawning ffmpeg test pattern feed (color bars, 1280x720 @ 30fps) to v4l2loopback device
- Implemented VirtualAudioDevices loading two pactl null-sink modules (AI output sink + virtual mic) and unloading them on cleanup
- Implemented DeviceManager orchestrating the full lifecycle: prereq check -> audio create -> camera start -> SIGTERM handler registration
- Enabled TypeScript declaration file generation (declaration: true) so all four modules produce .d.ts for downstream TypeScript consumers

## Task Commits

Each task was committed atomically:

1. **Task 1: Prerequisite checker and VirtualCamera** - `8b6898a` (feat)
2. **Task 2: VirtualAudioDevices and DeviceManager** - `ba0ea31` (feat)
3. **Task 3: Compile verification and type check** - `2ae75dd` (chore)

## Files Created/Modified
- `src/devices/prerequisites.ts` - checkPrerequisites() and printPrereqStatus() with per-check fix commands
- `src/devices/virtual-camera.ts` - VirtualCamera class managing ffmpeg subprocess lifecycle
- `src/devices/virtual-audio.ts` - VirtualAudioDevices class managing pactl module IDs
- `src/devices/index.ts` - DeviceManager orchestrating prereqs, audio, and camera as a unit
- `tsconfig.json` - Added declaration: true and declarationMap: true

## Decisions Made
- Added `declaration: true` to tsconfig.json: the plan expected .d.ts outputs but tsconfig lacked the flag. Added it so all device modules emit declarations for downstream TypeScript consumers.
- DeviceManager.startup() throws on prerequisite failure: this forces callers (CLI scripts, tests) to handle the failure path explicitly rather than silently continuing with broken devices.
- Virtual mic uses `media.class=Audio/Source/Virtual` in the pactl command: this ensures Chrome exposes the device as a microphone input rather than filtering it as a monitor source.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added declaration: true to tsconfig.json for .d.ts generation**
- **Found during:** Task 3 (compile verification)
- **Issue:** Plan's expected outputs included `.d.ts` type declaration files for all modules, but tsconfig.json from Plan 01 had no `declaration: true` setting, so `.d.ts` files were not being emitted.
- **Fix:** Added `"declaration": true` and `"declarationMap": true` to tsconfig.json `compilerOptions`
- **Files modified:** `tsconfig.json`
- **Verification:** `npm run build` now emits `.d.ts` + `.d.ts.map` alongside `.js` for all four device modules
- **Committed in:** `2ae75dd` (Task 3 chore commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for TypeScript consumers of the device modules — without declarations, downstream plans importing DeviceManager lose type safety. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviation above.

## User Setup Required
None - no external service configuration required for compilation. Device creation (modprobe, pactl) only runs at runtime when startup() is called.

## Next Phase Readiness
- All four device modules compile cleanly with TypeScript declarations
- DeviceManager is importable from dist/devices/index.js with full type safety
- Plan 03 (setup scripts + CLI) can import DeviceManager and call startup()/shutdown()
- Phase 2/3/5 can import DeviceManager for the full device lifecycle
- No pactl or modprobe calls happen at import time — only in startup()

## Self-Check: PASSED

- FOUND: src/devices/prerequisites.ts
- FOUND: src/devices/virtual-camera.ts
- FOUND: src/devices/virtual-audio.ts
- FOUND: src/devices/index.ts
- FOUND: tsconfig.json
- FOUND commit: 8b6898a (Task 1)
- FOUND commit: ba0ea31 (Task 2)
- FOUND commit: 2ae75dd (Task 3)
- npm run build: exits 0, no TypeScript errors
- dist/devices/*.js: all 4 device module JS files present
- dist/devices/*.d.ts: all 4 declaration files present
- node -e "import('./dist/devices/index.js').then(m => console.log(Object.keys(m)))": prints [ 'DeviceManager' ]

---
*Phase: 01-virtual-device-setup*
*Completed: 2026-03-26*
