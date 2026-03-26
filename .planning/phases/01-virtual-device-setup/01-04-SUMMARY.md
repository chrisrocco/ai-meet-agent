---
phase: 01-virtual-device-setup
plan: "04"
subsystem: infra
tags: [wsl2, v4l2loopback, pactl, obs, vb-cable, windows-bridge, documentation]

# Dependency graph
requires:
  - phase: 01-virtual-device-setup
    plan: "03"
    provides: "setup.sh, test-devices CLI, src/index.ts entry point"
  - phase: 01-virtual-device-setup
    plan: "01"
    provides: "detectPlatform() and Platform type from src/platform/detect.ts"
provides:
  - "src/platform/wsl2.ts: checkWsl2Prerequisites() probes v4l2loopback and pactl; returns Wsl2Status with path='windows-bridge' for this WSL2 kernel"
  - "docs/wsl2-setup.md: WSL2 architecture decision (PATH B — Windows bridges), probe results, OBS + VB-Cable setup guide, native Linux reference"
  - "scripts/setup-wsl2-windows.md: step-by-step Windows-side setup for OBS Virtual Camera and VB-Cable with Chrome verification"
affects: [02-browser-control, 03-audio-pipeline, 05-ai-audio-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "WSL2 path detection pattern: checkWsl2Prerequisites() checks lsmod and pactl availability at runtime to determine 'wslg' vs 'windows-bridge' path"

key-files:
  created:
    - src/platform/wsl2.ts
    - docs/wsl2-setup.md
    - scripts/setup-wsl2-windows.md
  modified: []

key-decisions:
  - "WSL2 PATH B (windows-bridge) chosen: v4l2loopback DKMS not compiled for WSL2 kernel 5.15.167.4-microsoft-standard-WSL2 and pactl not found — PATH A (WSLg) not viable without custom kernel compilation"
  - "Camera bridge: OBS Studio Virtual Camera (DirectShow) — Chrome on Windows sees it natively without any special flags"
  - "Audio bridge: VB-Cable (virtual audio cable pair) — CABLE Output exposed as Windows mic input; Node.js writes to CABLE Input from WSL2"
  - "Phase 1 checkpoint auto-approved per auto_advance=true config — device layer is functionally complete on native Linux; WSL2 bridges documented for Phase 2/3 implementation"

patterns-established:
  - "WSL2 detection pattern: checkWsl2Prerequisites() called by DeviceManager when detectPlatform() returns 'wsl2' — returns early with windows-bridge status and actionable notes"
  - "Documentation-first for environment-specific setup: docs/ directory established for guides that reference scripts/ for automation"

requirements-completed: [PLAT-02]

# Metrics
duration: 3min
completed: 2026-03-26
---

# Phase 1 Plan 04: WSL2 Architecture Decision Summary

**PATH B (Windows bridges) chosen after live probe: v4l2loopback absent from WSL2 kernel 5.15.167.4, pactl not found — OBS Virtual Camera + VB-Cable documented as the camera/mic path for Chrome on Windows**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-26T02:21:00Z
- **Completed:** 2026-03-26T02:24:22Z
- **Tasks:** 2 (1 auto + 1 checkpoint auto-approved)
- **Files modified:** 3

## Accomplishments
- Ran live WSL2 probe: kernel 5.15.167.4-microsoft-standard-WSL2, WSL 2.3.26.0, WSLg 1.0.65 — confirmed v4l2loopback module not available (DKMS not compiled), pactl not found
- Created src/platform/wsl2.ts with checkWsl2Prerequisites() that detects the viable path at runtime and returns actionable notes for each failed check
- Created docs/wsl2-setup.md documenting the architecture decision, actual probe results, OBS Virtual Camera + VB-Cable setup with Chrome verification steps
- Created scripts/setup-wsl2-windows.md as a numbered checklist for Windows-side bridge setup including troubleshooting section

## Task Commits

Each task was committed atomically:

1. **Task 1: WSL2 probe and platform module** - `68a392c` (feat)
2. **Task 2: Checkpoint — device visibility verify** - auto-approved (auto_advance=true)

## Files Created/Modified
- `src/platform/wsl2.ts` - checkWsl2Prerequisites(): probes v4l2loopback (lsmod) and pactl; returns Wsl2Status{path, checks[]}
- `docs/wsl2-setup.md` - Architecture decision document: PATH B chosen, probe results table, OBS + VB-Cable setup, confirmed device visibility section
- `scripts/setup-wsl2-windows.md` - Step-by-step Windows-side bridge setup: OBS Virtual Camera install, VB-Cable install + reboot, Chrome verification, troubleshooting

## Decisions Made
- **PATH B (windows-bridge) is the WSL2 path:** v4l2loopback DKMS module not compiled for the WSL2 kernel (`modinfo v4l2loopback` → "Module not found", no `/lib/modules/.../extra/` directory). pactl not available. Neither WSLg camera nor WSLg audio is viable without custom kernel compilation, which CONTEXT.md explicitly ruled out to avoid blocking the project.
- **OBS Virtual Camera for camera:** Standard Windows DirectShow device; Chrome sees it without any special launch flags. No interop needed for device registration.
- **VB-Cable for audio:** Free virtual audio cable. CABLE Output appears as a Windows microphone input; Node.js in WSL2 routes audio to CABLE Input in Phase 2.
- **Checkpoint auto-approved:** config.json `auto_advance: true` — human verification deferred to actual Windows-side bridge setup during Phase 2/3.

## Deviations from Plan

None — plan executed exactly as written. Probe results were as anticipated by the plan's context (WSL2 kernel without v4l2loopback DKMS support is the expected failure mode).

## Issues Encountered
- `sudo modprobe` required password (no passwordless sudo in this shell) — but this was moot because `modinfo v4l2loopback` already confirmed the module doesn't exist for this kernel, making PATH A definitively non-viable.

## User Setup Required
Windows-side bridge setup requires manual steps — documented in `scripts/setup-wsl2-windows.md`:
1. Install OBS Studio on Windows, enable Virtual Camera
2. Install VB-Cable on Windows (requires admin + reboot)
3. Verify both appear in Chrome's device dropdowns
4. Node.js bridge from WSL2 → Windows devices is Phase 2 work

## Next Phase Readiness
- Phase 1 complete: native Linux device layer (plans 01-03) + WSL2 architecture decision (plan 04)
- Phase 2 (browser control) can import src/platform/wsl2.ts to detect bridge vs native path
- Phase 2 must implement the WSL2 audio bridge: WSL2 Node.js → VB-Cable CABLE Input
- Phase 3 must implement the WSL2 video bridge: WSL2 Node.js → OBS Virtual Camera
- Open: "Confirmed Device Visibility" table in docs/wsl2-setup.md needs to be filled in after Phase 2/3 bring up the bridges

## Self-Check: PASSED

- FOUND: src/platform/wsl2.ts
- FOUND: docs/wsl2-setup.md
- FOUND: scripts/setup-wsl2-windows.md
- FOUND commit: 68a392c (Task 1)
- npm run build: exits 0, 0 TypeScript errors

---
*Phase: 01-virtual-device-setup*
*Completed: 2026-03-26*
