---
phase: 06-wsl2-audio-relay
type: verification
status: human_needed
verified: 2026-03-25
---

# Phase 6: WSL2 Audio Relay Server — Verification

**Phase Goal:** TCP relay server on port 19876 bridges audio between WSL2 Node.js process and VB-Cable on Windows, completing the WSL2 audio path that Phase 2 capture/output clients expect

## Automated Verification

### TypeScript Compilation
- `npx tsc --noEmit` passes with zero errors

### File Existence
- [x] `src/audio/wsl2-relay-server.ts` — exists, exports WslAudioRelayServer
- [x] `src/config/schema.ts` — contains wsl2.captureDevice, wsl2.outputDeviceIndex, wsl2.ffmpegPath, wsl2.ffplayPath
- [x] `src/audio/index.ts` — re-exports WslAudioRelayServer
- [x] `src/index.ts` — imports and integrates relay lifecycle
- [x] `scripts/setup-wsl2-windows.md` — contains VB-Cable, Chrome routing, ffmpeg, device verification, Listen to this device

### Code Structure Verification

**TCP Server (must_have 1):**
- [x] createServer({ noDelay: true }) on RELAY_PORT
- [x] Listens on 127.0.0.1

**Handshake Protocol (must_have 2):**
- [x] FrameReader parses first frame as JSON
- [x] Assigns socket role based on `type` field ('capture' or 'output')
- [x] Replaces existing client if reconnection occurs

**Capture Bridge (must_haves 3, 5):**
- [x] Spawns ffmpeg.exe with `-f dshow -i audio={captureDevice}`
- [x] Uses `env: process.env` for WSL2 interop
- [x] stdout raw PCM wrapped with `writeFrame()` before sending to capture client
- [x] Configurable device name via `config.wsl2.captureDevice`

**Output Bridge (must_haves 4, 6):**
- [x] Spawns ffplay.exe with `-f s16le -ar 16000 -ac 1`
- [x] Uses `env: process.env` for WSL2 interop
- [x] FrameReader extracts raw PCM from framed TCP data
- [x] Raw PCM written to ffplay.stdin (framing stripped)
- [x] Configurable device index via `config.wsl2.outputDeviceIndex`

**Auto-restart (must_have 7):**
- [x] Both bridges check `!this.stopped` on exit
- [x] setTimeout 1000ms before respawn (matches NativeVideoFeed pattern)

**TCP Socket Config (must_have 8):**
- [x] `createServer({ noDelay: true })`
- [x] `socket.setNoDelay(true)` on every accepted connection

**Config Schema (must_have 9):**
- [x] `wsl2.captureDevice` — string, default 'CABLE Output (VB-Audio Virtual Cable)'
- [x] `wsl2.outputDeviceIndex` — number, default 0
- [x] `wsl2.ffmpegPath` — string, default 'ffmpeg.exe'
- [x] `wsl2.ffplayPath` — string, default 'ffplay.exe'

**Lifecycle Integration:**
- [x] Relay starts BEFORE createAudioCapture()/createAudioOutput() on WSL2
- [x] Relay startup failure is non-fatal (try/catch with console.warn)
- [x] On native Linux, relay is never created (`if (platform === 'wsl2')` guard)
- [x] Relay stopped in shutdown handler (after audio clients, before video — relay outlives clients for clean disconnection)

**Setup Documentation:**
- [x] VB-Cable installation instructions
- [x] Chrome audio routing (Meet speakers to CABLE Input)
- [x] Operator monitoring via "Listen to this device"
- [x] ffmpeg/ffplay installation (winget and manual)
- [x] Device verification commands
- [x] Config example with all wsl2 fields

### Note on must_have wording

Plan 06-02 must_have states "Relay server is stopped during shutdown before audio clients" but the plan's implementation instructions (Change C) correctly specify "stop relay AFTER audio clients." The implementation follows the instructions — relay is stopped after capture and output, which is architecturally correct (relay must outlive clients for clean disconnection). The must_have text is misleading but the implementation is correct.

## Requirement Traceability

| Req ID | Plans | Description | Status |
|--------|-------|-------------|--------|
| PLAT-02 | 06-01, 06-02 | Works on Linux (WSL2) with appropriate device routing | VERIFIED (code) |

All Phase 6 requirement IDs (PLAT-02) are accounted for by both plans and have implementation evidence.

## Success Criteria Assessment

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | TCP server listens on port 19876 and accepts Wsl2AudioCapture/Wsl2AudioOutput clients | VERIFIED (code) | startTcpServer() + handleConnection() with capture/output handshake parsing |
| 2 | Audio from Meet forwarded to capture client as PCM frames | VERIFIED (code) | ffmpeg.exe dshow capture → stdout → writeFrame() → captureClient |
| 3 | PCM from output client forwarded to VB-Cable CABLE Input | VERIFIED (code) | outputClient → FrameReader → raw PCM → ffplay.exe stdin |
| 4 | Relay starts automatically as part of npm run dev | VERIFIED (code) | Integrated into main() with platform === 'wsl2' guard |
| 5 | Audio round-trip latency < 50ms | NEEDS HUMAN | Requires runtime measurement on WSL2 with Windows audio devices |

**Score:** 4/5 success criteria verified via code. 1 requires human runtime testing.

## Human Verification Required

The following items cannot be verified without a WSL2 environment with Windows audio devices:

1. **Audio relay starts successfully on WSL2:**
   - Run `npm run dev` from WSL2
   - Expected: `[AudioRelay] TCP relay listening on port 19876`
   - Expected: No ECONNREFUSED errors from audio clients

2. **Bridge processes connect to Windows audio:**
   - Expected: ffmpeg.exe captures from VB-Cable (or fails gracefully with clear device name error)
   - Expected: ffplay.exe outputs to correct audio device (or fails gracefully)

3. **Audio round-trip latency < 50ms:**
   - Measure time from audio input at VB-Cable to framed PCM arriving at capture client
   - TCP localhost + raw PCM streaming should be well under 50ms
   - ffmpeg.exe buffer size set to 50ms (`-audio_buffer_size 50`)

## Gaps Summary

No code gaps found. All must_haves verified against codebase. One success criterion (latency) requires runtime verification.
