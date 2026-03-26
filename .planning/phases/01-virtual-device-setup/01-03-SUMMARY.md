---
phase: 01-virtual-device-setup
plan: "03"
subsystem: infra
tags: [bash, typescript, v4l2loopback, ffmpeg, pactl, cli, entry-point]

# Dependency graph
requires:
  - phase: 01-virtual-device-setup
    plan: "02"
    provides: "DeviceManager class with startup()/shutdown()/registerShutdownHandlers() and checkPrerequisites()"
  - phase: 01-virtual-device-setup
    plan: "01"
    provides: "loadConfig() and Config type from src/config/loader.ts"
provides:
  - "scripts/setup.sh: idempotent one-time system setup script that installs v4l2loopback-dkms, ffmpeg, pipewire packages and persists v4l2loopback module across reboots"
  - "src/cli/test-devices.ts: standalone device verification CLI that starts all devices for 5s and exits 0 on success or 1 on prereq failure"
  - "src/index.ts: main application entry point that starts DeviceManager, registers SIGINT/SIGTERM handlers, and blocks until signal"
affects: [02-browser-control, 03-audio-pipeline, 05-ai-audio-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CLI entry point pattern: import DeviceManager, call startup() in try/catch, exit 1 on prereq failure with existing fix-command output from DeviceManager"
    - "Keep-alive pattern for long-running Node process: unresolved Promise with void type annotation blocks until signal handlers call process.exit"
    - "Idempotent bash setup script: lsmod/grep guards before modprobe, grep -qxF guards before writing modules-load.d config"

key-files:
  created:
    - scripts/setup.sh
    - src/cli/test-devices.ts
    - src/index.ts
  modified: []

key-decisions:
  - "setup.sh uses 'sudo tee' for /etc/modprobe.d writes rather than redirecting with > so set -euo pipefail catches write errors properly"
  - "test-devices CLI calls process.exit(0) explicitly after cleanup to avoid hanging on the unresolved promise pattern used in index.ts"
  - "src/index.ts uses an unresolved Promise<void> as its keep-alive mechanism — SIGINT/SIGTERM handlers registered via registerShutdownHandlers() call process.exit(0) to terminate"

patterns-established:
  - "CLI error handling: DeviceManager.startup() throws with message already including context, CLI catches and calls process.exit(1) — no need to duplicate error detail in CLI"
  - "Setup script structure: install packages -> configure modprobe.d -> configure modules-load.d -> load module now -> verify device exists"

requirements-completed: [VDEV-01, VDEV-02, PLAT-01]

# Metrics
duration: 1min
completed: 2026-03-26
---

# Phase 1 Plan 03: Entry Points and Setup Script Summary

**bash setup.sh installs v4l2loopback+ffmpeg+pipewire and persists module; npm run test-devices and npm run dev wire DeviceManager to user-facing CLI commands**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-26T02:18:33Z
- **Completed:** 2026-03-26T02:19:50Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created scripts/setup.sh as idempotent one-time system preparation script covering apt-get installs, modprobe.d config, modules-load.d boot persistence, immediate module load, and /dev/video10 existence check
- Created src/cli/test-devices.ts that exercises DeviceManager.startup() with test pattern for 5 seconds, prints per-device status, and exits 0/1/2 with clear messages
- Created src/index.ts as the main application entry point that starts DeviceManager without test pattern, registers SIGINT/SIGTERM cleanup, and blocks indefinitely until signal

## Task Commits

Each task was committed atomically:

1. **Task 1: Setup script with documented manual steps** - `ce77077` (feat)
2. **Task 2: test-devices CLI and main entry point** - `4409da6` (feat)

## Files Created/Modified
- `scripts/setup.sh` - One-time system setup: apt installs, modprobe.d, modules-load.d, immediate modprobe, device verify
- `src/cli/test-devices.ts` - Standalone device verification CLI: starts devices + test pattern for 5s, exits 0 on success
- `src/index.ts` - Main application entry point: starts devices, registers shutdown handlers, blocks until signal

## Decisions Made
- `setup.sh` uses `sudo tee` for writing to /etc/modprobe.d rather than `sudo bash -c "echo ... >"` so that `set -euo pipefail` catches write failures correctly.
- `test-devices.ts` calls `process.exit(0)` explicitly after `manager.shutdown()` to terminate cleanly rather than relying on Node.js to detect no remaining work (the 5-second setTimeout keeps the event loop open otherwise).
- `src/index.ts` uses an unresolved `Promise<void>` as the keep-alive — the SIGINT/SIGTERM handlers registered by `registerShutdownHandlers()` are the only intended exit path.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required for compilation. The setup script requires sudo and a system with kernel headers for DKMS; that is expected and documented in the script header.

## Next Phase Readiness
- `npm run test-devices` wired and ready to validate the full device stack end-to-end once hardware prerequisites are met
- `npm run dev` / `dist/index.js` provides the main process skeleton for Phase 2+ to extend
- Phase 2 (browser control) can import DeviceManager from dist/devices/index.js and call startup()/shutdown() the same way index.ts does
- Open blocker: v4l2loopback WSL2 kernel support still unverified (noted in STATE.md); setup.sh is the first real test of that

## Self-Check: PASSED

- FOUND: scripts/setup.sh
- FOUND: src/cli/test-devices.ts
- FOUND: src/index.ts
- FOUND commit: ce77077 (Task 1)
- FOUND commit: 4409da6 (Task 2)
- bash -n scripts/setup.sh: syntax OK
- npm run build: exits 0, 0 TypeScript errors
- dist/cli/test-devices.js: present
- dist/index.js: present

---
*Phase: 01-virtual-device-setup*
*Completed: 2026-03-26*
