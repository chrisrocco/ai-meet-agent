---
phase: 06-wsl2-audio-relay
plan: 01
subsystem: audio
tags: [tcp, wsl2, ffmpeg, ffplay, vb-cable, relay, dshow]

requires:
  - phase: 02-audio-pipeline
    provides: "FrameReader, writeFrame, RELAY_PORT framing protocol"
provides:
  - "WslAudioRelayServer class — TCP relay + Windows bridge lifecycle"
  - "Config schema wsl2 section with captureDevice, outputDeviceIndex, ffmpegPath, ffplayPath"
affects: [06-02, wsl2-audio]

tech-stack:
  added: []
  patterns: ["WSL2 bridge process lifecycle with auto-restart", "TCP handshake-based client role assignment"]

key-files:
  created:
    - src/audio/wsl2-relay-server.ts
  modified:
    - src/config/schema.ts

key-decisions:
  - "Used taskkill via powershell.exe for Windows process tree cleanup (matching Wsl2VideoFeed pattern)"
  - "Capture bridge outputs raw PCM, relay wraps in frames — ffmpeg stdout is NOT framed"
  - "Output bridge receives raw PCM from relay (frames stripped) — ffplay stdin expects raw PCM"

patterns-established:
  - "TCP handshake protocol: first framed JSON message assigns socket role (capture/output)"
  - "Bridge auto-restart: 1s delay on unexpected exit, matching NativeVideoFeed pattern"

requirements-completed: [PLAT-02]

duration: 5min
completed: 2026-03-25
---

# Plan 06-01: WSL2 Audio Relay Server Summary

**TCP relay server with capture/output bridge processes, config schema for WSL2 audio device settings**

## Performance

- **Duration:** 5 min
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Extended ConfigSchema with wsl2 section for Windows audio device configuration
- Implemented WslAudioRelayServer class with TCP server, handshake parsing, capture bridge (ffmpeg.exe), output bridge (ffplay.exe), auto-restart, and clean shutdown

## Task Commits

Each task was committed atomically:

1. **Task 1: Config schema extension** - `f4a9383` (feat)
2. **Task 2: WslAudioRelayServer** - `8dd1054` (feat)

## Files Created/Modified
- `src/config/schema.ts` - Added wsl2.captureDevice, wsl2.outputDeviceIndex, wsl2.ffmpegPath, wsl2.ffplayPath
- `src/audio/wsl2-relay-server.ts` - WslAudioRelayServer class with TCP relay and Windows bridge lifecycle

## Decisions Made
- Used taskkill via powershell.exe for Windows process tree cleanup, matching the existing Wsl2VideoFeed pattern
- FrameReader only used for TCP client data parsing; bridge stdout/stdin uses raw PCM
- Only add -audio_device_index flag to ffplay when outputDeviceIndex > 0 (default device needs no flag)

## Deviations from Plan

None - plan executed exactly as written

## Issues Encountered
None

## Next Phase Readiness
- WslAudioRelayServer ready for lifecycle integration in Plan 06-02
- Config schema ready for user configuration

---
*Phase: 06-wsl2-audio-relay*
*Completed: 2026-03-25*
