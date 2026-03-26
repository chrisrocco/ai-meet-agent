# Phase 6: WSL2 Audio Relay Server - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the TCP relay server that listens on port 19876 inside WSL2 and bridges audio between the Node.js process and Windows audio devices (VB-Cable). The relay completes the missing piece that Phase 2's Wsl2AudioCapture and Wsl2AudioOutput clients already expect. The capture/output client code, framing protocol, and handshake format are already defined — this phase builds the server side and the Windows audio bridge processes.

</domain>

<decisions>
## Implementation Decisions

### Windows Audio Bridge Approach
- ffmpeg.exe on Windows is acceptable — user is willing to install it
- VB-Cable is not yet installed — setup guide exists at scripts/setup-wsl2-windows.md
- Operator needs to hear Meet participants through speakers AND have the relay capture the audio — need a split/mirror approach for the capture direction

### Relay Server Lifecycle
- Embedded in the main Node.js process (src/index.ts) — not a separate process
- Only starts on WSL2 platform — skip relay startup on native Linux entirely
- Non-fatal on failure — log warning and continue without audio if relay can't start (consistent with existing audio pipeline error handling pattern)
- Relay must start BEFORE audio capture/output clients try to connect (currently clients connect immediately and get ECONNREFUSED)

### Capture Path (Meet → Relay)
- Windows-side bridge process handles format conversion to 16kHz/16-bit/mono PCM before sending to relay — relay stays format-agnostic
- Audio from Meet participants must be capturable while operator also hears it through speakers — routing must split/mirror, not redirect exclusively

### Output Path (Relay → VB-Cable)
- AI response audio flows from Wsl2AudioOutput client → relay → Windows bridge → VB-Cable CABLE Input → Chrome picks up as mic
- Output format is already 16kHz/16-bit/mono PCM from the AI pipeline

### Claude's Discretion
- Specific Windows audio bridge technology (ffmpeg.exe WASAPI, PowerShell audio, or other approach)
- Capture routing strategy (WASAPI loopback, dedicated VB-Cable, or other method to split Meet audio)
- Whether bridge processes are persistent or per-session
- Auto-restart behavior for bridge processes on crash
- Startup readiness signaling (wait for bridge vs accept connections immediately)
- Silence handling on output path
- Relay-level audio monitoring/logging for debugging

</decisions>

<specifics>
## Specific Ideas

- The ECONNREFUSED spam the user saw during testing is the primary UX problem to solve — capture/output clients reconnect every 1s forever when relay isn't running
- Existing pattern: NativeVideoFeed auto-restarts ffmpeg on unexpected exit — same pattern likely applies to bridge processes
- The existing framing protocol (4-byte LE length prefix) and handshake format (JSON with type: "capture"|"output", sink: string) are FIXED — relay must implement the server side of this protocol exactly

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `FrameReader` class (src/audio/wsl2-relay.ts): Accumulates TCP data and extracts length-prefixed frames — use server-side for parsing client messages
- `writeFrame()` function (src/audio/wsl2-relay.ts): Write length-prefixed frames to TCP sockets — use for sending audio to capture clients
- `RELAY_PORT` constant (src/audio/wsl2-relay.ts): 19876 — the port both clients and server use
- `computeRmsNormalized()` (src/audio/pcm-utils.ts): RMS level computation — available if relay-level monitoring is needed
- `AUDIO_FORMAT` constant (src/audio/types.ts): 16kHz, 16-bit signed LE, mono — the expected PCM format

### Established Patterns
- EventEmitter-based interfaces with typed events ('error', 'reconnecting', 'level')
- Platform detection gating (src/audio/factory.ts): `if (p === 'wsl2')` pattern for WSL2-specific code paths
- Non-fatal audio startup (src/index.ts:80-83): try/catch with warning, pipeline stays inactive
- Auto-restart on subprocess exit (src/video/native-feed.ts:76): 1s timeout restart for ffmpeg crashes

### Integration Points
- `src/index.ts`: Relay server must start BEFORE `createAudioCapture()` / `createAudioOutput()` are called (line ~57)
- `Wsl2AudioCapture.connectToRelay()` (src/audio/wsl2-capture.ts:47): Connects to 127.0.0.1:RELAY_PORT, sends JSON handshake
- `Wsl2AudioOutput.start()` (src/audio/wsl2-output.ts:28): Connects to 127.0.0.1:RELAY_PORT, sends JSON handshake
- `src/audio/factory.ts`: Factory already routes to WSL2 implementations — no factory changes needed

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-wsl2-audio-relay*
*Context gathered: 2026-03-25*
