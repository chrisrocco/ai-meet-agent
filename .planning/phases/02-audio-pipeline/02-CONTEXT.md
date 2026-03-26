# Phase 2: Audio Pipeline - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Capture Meet participant audio from Chrome's output into a Node.js PCM stream, and play PCM audio back through the virtual microphone — with the capture and output paths architecturally isolated to prevent feedback loops. This phase does NOT include AI API streaming (Phase 4) or any conversation logic.

Requirements: AUDI-01 (capture incoming audio), AUDI-04 (echo cancellation via sink isolation).

</domain>

<decisions>
## Implementation Decisions

### Capture method
- Use parec (PulseAudio) on native Linux to record from the sink monitor source — consistent with existing pactl usage in VirtualAudioDevices
- Route Chrome's audio to the designated ai_meet_sink, then capture from that sink's monitor (not per-application capture)
- Expose captured audio as a Node.js Readable stream (subprocess stdout piped)
- Auto-reconnect if the capture subprocess dies — emit 'reconnecting' event so consumers know; meetings can last hours

### Feedback isolation
- Separate sinks for capture and output — capture reads from ai_meet_sink monitor, output writes to ai_meet_mic sink. PulseAudio routing keeps them physically separate
- Output path uses pacat writing PCM to the virtual mic sink stdin — mirrors capture approach for consistency
- Automated verification test: play a known PCM tone through output, verify it does NOT appear in capture stream

### Audio format & conversion
- Standard internal format: 16kHz, 16-bit signed LE, mono (s16le) — matches voice AI API expectations
- Include basic typed PCM conversion utilities (resample, bit depth conversion) tested against known data per success criteria #4
- RMS level events emitted periodically from both capture and output streams for debugging and operator visibility ("audio is flowing")

### WSL2 bridge audio
- TCP socket relay for WSL2↔Windows boundary — bidirectional, low-latency, debuggable via localhost passthrough
- Auto-launch Windows relay via powershell.exe from WSL2 — user doesn't manually start anything; stopped on shutdown
- Unified AudioCapture/AudioOutput interface — factory picks implementation (parec vs bridge) based on platform detection; consumers are platform-agnostic
- WSL2 must work end-to-end — this is the active dev environment; native Linux is the secondary target

### Claude's Discretion
- Exact subprocess management details (spawn options, buffer sizes)
- TCP relay protocol design (framing, handshake)
- Chunk size and timing for stream events
- Error message formatting and logging verbosity

</decisions>

<specifics>
## Specific Ideas

- VirtualAudioDevices already creates two independent pactl null-sink modules — capture and output sinks are already architecturally separate
- DeviceManager.startup() returns sink/mic names that the audio pipeline should consume
- WSL2 path currently returns hardcoded VB-Cable device names — the bridge relay needs to connect to these Windows-side devices
- Platform detection (detectPlatform()) already exists and returns 'wsl2' | 'linux' — use this for factory routing

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `VirtualAudioDevices` (src/devices/virtual-audio.ts): Creates/cleans up pactl null-sink modules — capture/output sinks already exist
- `DeviceManager` (src/devices/index.ts): Lifecycle management with startup/shutdown/signal handlers — audio pipeline integrates here
- `detectPlatform()` (src/platform/detect.ts): Returns 'wsl2' | 'linux' — use for factory routing
- `Config.devices.sink/mic` (src/config/schema.ts): Sink names already configured (ai_meet_sink, ai_meet_mic)

### Established Patterns
- PulseAudio via execSync for device setup — audio pipeline will use spawn for long-running subprocesses
- Platform branching: WSL2 vs native Linux paths in DeviceManager.startup() — extend this pattern
- Cleanup on SIGINT/SIGTERM via registerShutdownHandlers() — audio subprocesses must be included

### Integration Points
- `DeviceManager.startup()` returns DeviceStatus with sink/mic names → audio pipeline reads these
- `main()` in src/index.ts has placeholder comment: "Future phases add audio pipeline and AI session here"
- Audio pipeline classes will be new files in src/audio/ directory

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-audio-pipeline*
*Context gathered: 2026-03-25*
