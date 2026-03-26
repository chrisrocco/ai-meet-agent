---
phase: 03-static-video-feed
plan: 01
subsystem: video
tags: [ffmpeg, v4l2, mjpeg, http, wsl2, powershell, EventEmitter]

requires:
  - phase: 01-virtual-device-setup
    provides: detectPlatform() for factory routing and v4l2 device number from config

provides:
  - VideoFeed interface (EventEmitter-based, start/stop contract)
  - NativeVideoFeed: ffmpeg -loop 1 -re streaming to v4l2 device with auto-restart
  - Wsl2VideoFeed: HTTP MJPEG broadcast server with ffmpeg.exe via powershell.exe
  - createVideoFeed factory routing by platform
  - DEFAULT_PLACEHOLDER_PATH bundled JPEG asset
  - devices.camera.imagePath config field (optional override)
  - video.mjpegPort config field (default 8085)

affects:
  - 03-static-video-feed (remaining plans integrating video into main())
  - 04-gemini-integration (may consume VideoFeed for visual context)

tech-stack:
  added: []
  patterns:
    - "EventEmitter interface pattern (VideoFeed mirrors AudioCapture)"
    - "Detached process group for kill -pid on native Linux"
    - "HTTP multipart/x-mixed-replace MJPEG broadcast with Set<ServerResponse>"
    - "JPEG frame extraction by FF D8 / FF D9 SOI/EOI markers"
    - "Platform factory pattern: createVideoFeed routes to NativeVideoFeed or Wsl2VideoFeed"

key-files:
  created:
    - src/video/types.ts
    - src/video/native-feed.ts
    - src/video/wsl2-feed.ts
    - src/video/factory.ts
    - src/video/index.ts
    - src/video/assets/placeholder.jpg
  modified:
    - src/config/schema.ts

key-decisions:
  - "Placeholder JPEG created as minimal 1x1 JPEG (334 bytes) using Node.js — ffmpeg unavailable in build environment; ffmpeg scales at runtime with scale/pad filter"
  - "MJPEG broadcast uses manual JPEG frame extraction (FF D8...FF D9 markers) rather than mpjpeg muxer for ffmpeg compatibility"
  - "NativeVideoFeed uses detached:true process group so stop() sends SIGTERM to entire group via process.kill(-pid)"
  - "Wsl2VideoFeed kills Windows process tree via taskkill /F /T — necessary because powershell.exe spawns child ffmpeg.exe"

patterns-established:
  - "VideoFeed interface: EventEmitter + start(imagePath)/stop() matches AudioCapture pattern"
  - "Auto-restart: stopped flag + restartTimer pattern (identical to NativeAudioCapture)"

requirements-completed: [VDEV-03]

duration: 2min
completed: 2026-03-26
---

# Phase 03 Plan 01: Static Video Feed Module Summary

**Complete src/video/ module: VideoFeed interface, NativeVideoFeed (ffmpeg to v4l2 with process group kill), Wsl2VideoFeed (HTTP MJPEG broadcast via ffmpeg.exe/powershell.exe), platform factory, and bundled placeholder JPEG**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-26T04:11:42Z
- **Completed:** 2026-03-26T04:13:36Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- VideoFeed interface established (EventEmitter, start(imagePath)/stop()), mirroring AudioCapture pattern exactly
- NativeVideoFeed streams any JPEG to v4l2 at 15fps with scale/pad filter, auto-restarts on ffmpeg exit, kills entire process group on stop()
- Wsl2VideoFeed broadcasts MJPEG over HTTP to multiple clients simultaneously, spawning ffmpeg.exe on Windows via powershell.exe with manual JPEG frame extraction
- Config schema extended with devices.camera.imagePath (optional override) and video.mjpegPort (default 8085)

## Task Commits

Each task was committed atomically:

1. **Task 1: VideoFeed types, config schema, placeholder image, NativeVideoFeed** - `a1c9836` (feat)
2. **Task 2: Wsl2VideoFeed, factory, and public video module exports** - `a65fb38` (feat)

## Files Created/Modified
- `src/video/types.ts` - VideoFeed interface, DEFAULT_PLACEHOLDER_PATH export
- `src/video/native-feed.ts` - NativeVideoFeed: ffmpeg to v4l2, detached process group, auto-restart
- `src/video/wsl2-feed.ts` - Wsl2VideoFeed: HTTP MJPEG broadcast, ffmpeg.exe via powershell.exe
- `src/video/factory.ts` - createVideoFeed() routing native-linux vs wsl2 by platform
- `src/video/index.ts` - Public re-exports: createVideoFeed, VideoFeed, DEFAULT_PLACEHOLDER_PATH
- `src/video/assets/placeholder.jpg` - Bundled minimal valid JPEG (1x1 gray, 334 bytes)
- `src/config/schema.ts` - Added imagePath optional field to camera object, added video.mjpegPort

## Decisions Made
- Used minimal 1x1 JPEG placeholder (Node.js Buffer) since ffmpeg unavailable in build environment — ffmpeg's scale/pad filter handles resize at runtime
- MJPEG broadcast uses manual JPEG frame extraction (FF D8 SOI / FF D9 EOI markers) from `-f image2pipe -vcodec mjpeg` stdout — more portable than `-f mpjpeg` which has inconsistent boundary tag support
- NativeVideoFeed uses `detached: true` + `process.kill(-pid, 'SIGTERM')` to kill entire process group, ensuring no orphan ffmpeg processes
- Wsl2VideoFeed cleanup uses `taskkill /F /T /PID` to kill Windows process tree (powershell.exe + child ffmpeg.exe)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- ffmpeg not available in WSL2 build environment for placeholder generation — resolved by creating minimal valid 1x1 JPEG using Node.js Buffer (plan explicitly anticipated this fallback)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Complete video module ready for integration into main() alongside audio pipeline
- createVideoFeed(videoNr, mjpegPort) ready to call with config values
- start(imagePath) accepts either DEFAULT_PLACEHOLDER_PATH or config override

---
*Phase: 03-static-video-feed*
*Completed: 2026-03-26*
