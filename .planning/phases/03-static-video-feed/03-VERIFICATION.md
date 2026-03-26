---
phase: 03-static-video-feed
verified: 2026-03-25T00:00:00Z
status: human_needed
score: 13/13 must-haves verified
re_verification: false
human_verification:
  - test: "Google Meet shows placeholder image as live video feed"
    expected: "Selecting the virtual camera in Google Meet displays the dark gray placeholder image (not a black screen, frozen frame indicator, or error)"
    why_human: "Requires a running browser session with Google Meet and the virtual camera device active — cannot verify device-picker appearance or Meet compatibility programmatically"
  - test: "Video feed sustains 10 minutes without stutter or dropout"
    expected: "The ffmpeg subprocess runs continuously for at least 10 minutes; no frame drops, device resets, or black-screen periods observed in Google Meet"
    why_human: "Long-running behavioral test requiring visual observation of the feed in a real browser"
  - test: "No zombie ffmpeg processes after SIGINT"
    expected: "After pressing Ctrl+C, 'ps aux | grep ffmpeg' shows no residual ffmpeg processes; NativeVideoFeed's process.kill(-pid, SIGTERM) and Wsl2VideoFeed's taskkill /F /T are effective"
    why_human: "Process-tree behavior (detached process group kill) cannot be verified without actually running the application and inspecting the process table after shutdown"
---

# Phase 03: Static Video Feed Verification Report

**Phase Goal:** A static JPEG image streams continuously to the virtual camera device at a consistent frame rate, appearing as a live webcam to Google Meet
**Verified:** 2026-03-25
**Status:** human_needed — all automated checks pass; 3 success criteria require live runtime testing
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | VideoFeed interface defines start(imagePath)/stop() contract | VERIFIED | `src/video/types.ts` exports `VideoFeed extends EventEmitter` with exact `start(imagePath: string): void` and `stop(): void` signatures |
| 2 | NativeVideoFeed spawns ffmpeg with -loop 1 -re, yuv420p, v4l2 at 15fps | VERIFIED | `native-feed.ts` lines 48-60: args array includes `-loop 1`, `-re`, `-pix_fmt yuv420p`, `-f v4l2`, `-r 15` |
| 3 | NativeVideoFeed auto-restarts on unexpected ffmpeg exit after 1s | VERIFIED | `native-feed.ts` lines 74-82: `exit` handler checks `!this.stopped`, emits `restarting`, sets `setTimeout(1000)` before calling `spawnFfmpeg()` |
| 4 | NativeVideoFeed kills process group (not just child) on stop() | VERIFIED | `native-feed.ts` line 89: `process.kill(-this.proc.pid, 'SIGTERM')` — negative PID targets entire process group; `detached: true` on line 59 ensures ffmpeg creates a new group |
| 5 | Wsl2VideoFeed spawns ffmpeg.exe via powershell.exe | VERIFIED | `wsl2-feed.ts` line 111: `this.spawnFn('powershell.exe', ['-Command', psCommand], ...)` where psCommand begins with `ffmpeg.exe` |
| 6 | Wsl2VideoFeed uses broadcast pattern for multiple HTTP clients | VERIFIED | `wsl2-feed.ts`: `private readonly clients = new Set<ServerResponse>()` (line 31); `broadcastFrame()` iterates the entire set (lines 172-191); HTTP handler adds each client to the set (line 68) |
| 7 | Factory createVideoFeed() routes to correct implementation by platform | VERIFIED | `factory.ts` lines 18-22: calls `detectPlatform()`, routes to `Wsl2VideoFeed` on `wsl2`, `NativeVideoFeed` otherwise |
| 8 | Config schema has devices.camera.imagePath (optional) and video.mjpegPort | VERIFIED | `schema.ts` lines 8, 23: `imagePath: z.string().optional()` and `mjpegPort: z.number().int().min(1024).max(65535).default(8085)` |
| 9 | Video feed starts alongside audio in main() | VERIFIED | `src/index.ts` lines 87-108: `createVideoFeed(config.devices.camera.videoNr, config.video.mjpegPort, platform)`, `start(imagePath)`, error events wired |
| 10 | Video feed stops cleanly on SIGINT/SIGTERM | VERIFIED | `src/index.ts` lines 121-123: `videoFeed.stop()` called inside `shutdown()` handler; `process.on('SIGINT', shutdown)` and `process.on('SIGTERM', shutdown)` registered at lines 128-129 |
| 11 | Error events caught and logged (no unhandled crashes) | VERIFIED | `src/index.ts` lines 94-97: `videoFeed.on('restarting', ...)` and `videoFeed.on('error', err => console.warn(...))` — startup failures also caught by outer try/catch (lines 105-108) |
| 12 | WSL2 mode logs MJPEG URL for OBS configuration | VERIFIED | `src/index.ts` lines 99-101: `if (platform === 'wsl2')` logs `http://localhost:${config.video.mjpegPort}/feed` and references `docs/wsl2-video-setup.md` |
| 13 | WSL2 OBS setup documented | VERIFIED | `docs/wsl2-video-setup.md` exists (151 lines, 5399 bytes): architecture diagram, prerequisites, 5-step OBS setup, config reference, troubleshooting section |

**Score:** 13/13 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/video/types.ts` | VideoFeed interface and DEFAULT_PLACEHOLDER_PATH | VERIFIED | Exports `VideoFeed`, `DEFAULT_PLACEHOLDER_PATH`; uses `import.meta.url` resolution |
| `src/video/native-feed.ts` | NativeVideoFeed with auto-restart and process group kill | VERIFIED | 97 lines; full lifecycle implementation with detached spawn and `-pid` kill |
| `src/video/wsl2-feed.ts` | Wsl2VideoFeed MJPEG HTTP broadcast | VERIFIED | 229 lines; HTTP server, JPEG frame extraction via FF D8/FF D9 markers, Set-based broadcast |
| `src/video/factory.ts` | Platform-aware factory | VERIFIED | Routes by `detectPlatform()` |
| `src/video/index.ts` | Public re-exports | VERIFIED | Exports `createVideoFeed`, `VideoFeed`, `DEFAULT_PLACEHOLDER_PATH` |
| `src/video/assets/placeholder.jpg` | Valid JPEG placeholder | VERIFIED | 334-byte JFIF 1x1 grayscale JPEG; ffmpeg scale/pad filter resizes to 1280x720 at runtime |
| `src/config/schema.ts` | imagePath and video.mjpegPort fields | VERIFIED | Both fields present with correct types and defaults |
| `src/index.ts` | Video feed lifecycle in main() | VERIFIED | Import, start, event wiring, config-aware imagePath, shutdown stop |
| `docs/wsl2-video-setup.md` | WSL2 OBS setup guide | VERIFIED | 151 lines; complete with architecture, prerequisites, OBS config steps, troubleshooting |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/video/factory.ts` | `src/platform/detect.ts` | `detectPlatform()` | VERIFIED | Line 1: `import { detectPlatform, type Platform } from '../platform/detect.js'`; line 18: `detectPlatform()` called |
| `src/video/native-feed.ts` | ffmpeg subprocess | `spawn` with `detached: true` | VERIFIED | Line 59: `detached: true` in spawn options; line 89: `process.kill(-this.proc.pid, 'SIGTERM')` uses process group |
| `src/video/wsl2-feed.ts` | `powershell.exe` + `ffmpeg.exe` | `spawn('powershell.exe', ...)` | VERIFIED | Line 111: `this.spawnFn('powershell.exe', ['-Command', psCommand])` where psCommand starts with `ffmpeg.exe` |
| `src/index.ts` | `src/video/factory.ts` | `createVideoFeed()` call | VERIFIED | Line 11: import; line 90: `createVideoFeed(config.devices.camera.videoNr, config.video.mjpegPort, platform)` |
| `src/index.ts` shutdown | `videoFeed.stop()` | SIGINT/SIGTERM handler | VERIFIED | Lines 121-123 inside `shutdown()` function; registered at lines 128-129 |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| VDEV-03 | 03-01-PLAN.md, 03-02-PLAN.md | Static placeholder image fed through virtual camera as video stream | SATISFIED | NativeVideoFeed streams JPEG to v4l2 at 15fps; Wsl2VideoFeed serves MJPEG over HTTP; both wired into main() with lifecycle management; placeholder.jpg bundled |

No orphaned requirements for Phase 3 — REQUIREMENTS.md traceability table maps only VDEV-03 to Phase 3.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

No TODOs, FIXMEs, placeholder stubs, empty implementations, or unhandled returns found in any Phase 3 files.

TypeScript compilation: **zero errors** (`npx tsc --noEmit` produces no output).

---

### Human Verification Required

All three phase success criteria require live runtime testing:

#### 1. Google Meet Webcam Display

**Test:** Start `npx tsx src/index.ts`, open Google Meet in Chrome, open camera settings, select the virtual camera device.
**Expected:** The placeholder image (dark gray 1x1 JPEG scaled to 1280x720 by ffmpeg) appears as the video feed — not a black screen, error icon, or frozen/static indicator.
**Why human:** Device-picker visibility and Meet's acceptance of the v4l2 stream cannot be verified without a running browser and live Meet session.

#### 2. 10-Minute Continuous Feed

**Test:** Leave the application running with the virtual camera active in Google Meet for at least 10 minutes.
**Expected:** No stutter, dropout, black frames, or device-reset errors during the period; ffmpeg auto-restart (if triggered) recovers seamlessly.
**Why human:** Long-running behavioral stability cannot be inferred from static code analysis.

#### 3. Clean SIGINT Shutdown (No Zombie Processes)

**Test:** With the application running, press Ctrl+C. Then run `ps aux | grep ffmpeg`.
**Expected:** No residual ffmpeg or ffmpeg.exe processes. On native Linux, `process.kill(-pid, 'SIGTERM')` should terminate the entire detached process group. On WSL2, `taskkill /F /T /PID` should kill the Windows process tree.
**Why human:** Process-group kill behavior requires inspecting the OS process table after a live shutdown — not verifiable by grep.

---

### Implementation Notes

- The placeholder image is a 1x1 grayscale JPEG (334 bytes). At runtime ffmpeg's scale/pad filter upscales it to 1280x720 with black letterboxing. This is functional but the resulting image is a solid gray square — sufficient for "placeholder visible in Meet" criterion but visually minimal. A more descriptive image (e.g., text overlay) would improve operator UX but is not required by VDEV-03.
- The WSL2 HTTP server serves all URL paths with the MJPEG stream (no path routing). The log message and docs reference `/feed` as the canonical URL. Any path resolves to the feed — a minor inconsistency with no functional impact.
- Commit hashes documented in summaries (`a1c9836`, `a65fb38`, `6c3098d`, `92cec5e`) are all verified present in git history.

---

_Verified: 2026-03-25_
_Verifier: Claude (gsd-verifier)_
