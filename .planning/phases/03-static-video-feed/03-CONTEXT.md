# Phase 3: Static Video Feed - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Stream a static JPEG image continuously to the virtual camera device at a consistent frame rate, appearing as a live webcam to Google Meet. This phase does NOT include dynamic video, avatar animation, or screen sharing — just a persistent static image feed.

Requirements: VDEV-03 (static placeholder image fed through virtual camera as video stream).

</domain>

<decisions>
## Implementation Decisions

### Placeholder image
- Bundled default image — professional avatar silhouette or abstract pattern that looks like a camera is connected but person is away
- User-configurable via `devices.camera.imagePath` in config schema — falls back to bundled default if not set
- Resolution: 1280x720 (720p) — matches existing VirtualCamera test pattern, standard webcam for Meet
- Frame rate: 15 fps — sufficient for static image, prevents Meet "frozen feed" indicator, half the CPU of 30fps
- Non-16:9 source images: pad with black bars (scale to fit, no distortion)

### Feed stability
- Auto-restart on ffmpeg crash — detect exit, restart after short delay, emit event so orchestrator knows. Matches audio capture auto-reconnect pattern
- Health monitoring: just restart on exit (no periodic polling) — ffmpeg 'exit' event is sufficient for a static feed
- Process group kill on shutdown — spawn ffmpeg in new process group, kill group on shutdown to prevent zombie processes even on unclean exit

### WSL2 video path
- Use PowerShell + ffmpeg.exe on Windows side — launch ffmpeg.exe via powershell.exe from WSL2, reads image from /mnt/ path, outputs to OBS Virtual Camera
- OBS setup docs needed — include installation + virtual camera plugin configuration in WSL2 docs
- Unified VideoFeed interface with factory — `VideoFeed` interface with `start(imagePath)/stop()`, factory picks `NativeVideoFeed` (v4l2) or `Wsl2VideoFeed` based on platform. Matches audio module pattern
- WSL2 must work end-to-end — this is the active dev environment; native Linux v4l2 is secondary

### Claude's Discretion
- Default placeholder image design/generation approach
- ffmpeg arguments for image-to-video conversion
- Restart delay timing
- Process group implementation details
- OBS virtual camera configuration specifics

</decisions>

<specifics>
## Specific Ideas

- VirtualCamera already exists with ffmpeg test pattern at 1280x720@30fps — extend or replace with static image feed
- DeviceManager.startup() has `startTestPattern` boolean — the static feed should replace or coexist with this
- Audio module established the factory pattern (createAudioCapture/createAudioOutput) — video should follow the same shape (createVideoFeed)
- WSL2 path already uses powershell.exe pattern from audio relay — can reuse that spawn approach

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `VirtualCamera` (src/devices/virtual-camera.ts): ffmpeg spawn, SIGTERM cleanup, exit handling — base for static feed
- `DeviceManager` (src/devices/index.ts): Lifecycle management, platform branching, shutdown handlers
- `detectPlatform()` (src/platform/detect.ts): 'wsl2' | 'native-linux' routing
- Audio factory pattern (src/audio/factory.ts): createAudioCapture/createAudioOutput — template for video factory

### Established Patterns
- ffmpeg subprocess management with error/exit handlers (VirtualCamera)
- Platform-specific factory routing (audio module)
- Auto-reconnect on unexpected exit (NativeAudioCapture)
- Error event handling in main() to prevent unhandled crashes (learned from Phase 2 UAT)
- Config schema extension with defaults (audio.relayPort pattern)

### Integration Points
- `DeviceManager.startup()` — video feed starts here alongside audio
- `src/index.ts main()` — needs error handlers for video feed (like audio)
- Config schema (`src/config/schema.ts`) — add `devices.camera.imagePath`
- Shutdown handler in main() — must stop video feed on SIGINT/SIGTERM

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-static-video-feed*
*Context gathered: 2026-03-25*
