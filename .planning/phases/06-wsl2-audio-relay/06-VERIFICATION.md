---
phase: 06-wsl2-audio-relay
verified: 2026-03-25T00:00:00Z
status: human_needed
score: 4/5 success criteria verified
re_verification:
  previous_status: human_needed
  previous_score: 4/5
  gaps_closed:
    - "Plan 06-03 closed both UAT blockers: bridge error crash (this.emit replaced with console.warn) and duplicate relay listening log"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Audio relay starts successfully on WSL2"
    expected: "npm run dev shows [AudioRelay] TCP relay listening on port 19876 exactly once. Capture and output clients connect without ECONNREFUSED errors."
    why_human: "Requires WSL2 environment with Windows audio devices to run"
  - test: "Bridge processes connect to Windows audio"
    expected: "ffmpeg.exe captures from VB-Cable or fails gracefully with a clear device-name error. ffplay.exe outputs to the correct audio device or fails gracefully."
    why_human: "Requires VB-Cable installed on Windows and ffmpeg/ffplay on Windows PATH"
  - test: "Audio round-trip latency under 50ms"
    expected: "Time from audio input at VB-Cable to framed PCM arriving at the capture client is under 50ms. The -audio_buffer_size 50 flag on ffmpeg constrains buffering."
    why_human: "Requires runtime measurement on WSL2 with live audio devices"
  - test: "Clean shutdown with no orphaned Windows processes"
    expected: "After Ctrl+C, tasklist | findstr ffmpeg on Windows shows no leftover ffmpeg.exe or ffplay.exe processes."
    why_human: "Requires WSL2 environment — UAT test 6 was skipped due to earlier crash; crash is now fixed so this needs a new test run"
---

# Phase 6: WSL2 Audio Relay — Verification Report

**Phase Goal:** TCP relay server on port 19876 bridges audio between WSL2 Node.js process and VB-Cable on Windows, completing the WSL2 audio path that Phase 2 capture/output clients expect
**Verified:** 2026-03-25
**Status:** human_needed
**Re-verification:** Yes — after Plan 06-03 gap closure (UAT-identified blockers fixed)

---

## Goal Achievement

### Observable Truths

All truths verified against actual codebase. The two UAT blockers (Plan 06-03 targets) are confirmed fixed.

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | TCP server on RELAY_PORT 19876 accepts capture and output clients | VERIFIED | `startTcpServer()` creates `createServer({ noDelay: true })` listening on `127.0.0.1:port`; `handleConnection()` parses handshake and routes to `setupCaptureClient` / `setupOutputClient` |
| 2 | Server parses first framed message as JSON handshake and assigns socket role | VERIFIED | `FrameReader` in `handleConnection()` buffers until first complete frame; `JSON.parse(frames[0])` extracts `type`; dispatches on `'capture'` or `'output'` |
| 3 | Capture bridge spawns ffmpeg.exe via WSL2 interop and forwards raw PCM as framed TCP to capture client | VERIFIED | `spawnCaptureBridge()` spawns `config.wsl2.ffmpegPath` with `-f dshow -audio_buffer_size 50 -i audio=${captureDevice} -f s16le -ar 16000 -ac 1 pipe:1`; `{ env: process.env }`; stdout handler calls `writeFrame(captureClient, pcm)` |
| 4 | Output bridge spawns ffplay.exe and writes raw PCM from output client to its stdin | VERIFIED | `spawnOutputBridge()` spawns `config.wsl2.ffplayPath` with `-f s16le -ar 16000 -ac 1 -nodisp -autoexit -i pipe:0`; `setupOutputClient()` feeds `FrameReader` and writes extracted frames to `outputProc.stdin` |
| 5 | Framing direction is correct — capture: raw PCM wrapped; output: frames stripped | VERIFIED | Capture: `writeFrame(captureClient, pcm)` wraps raw PCM for TCP. Output: `FrameReader.feed()` extracts payload, `outputProc.stdin.write(frame)` sends raw PCM |
| 6 | Bridge processes auto-restart on unexpected exit after 1s delay | VERIFIED | Both `spawnCaptureBridge()` and `spawnOutputBridge()` have `on('exit')` handlers: `if (!this.stopped) { setTimeout(() => this.spawnXBridge(), 1000) }` |
| 7 | All TCP sockets use setNoDelay(true) | VERIFIED | `createServer({ noDelay: true })` at construction; `socket.setNoDelay(true)` called in `handleConnection()` on every accepted socket |
| 8 | Config schema includes wsl2.captureDevice, wsl2.outputDeviceIndex, wsl2.ffmpegPath, wsl2.ffplayPath | VERIFIED | `src/config/schema.ts` lines 22-27: `wsl2` object with all four fields and sensible defaults |
| 9 | Bridge errors are non-fatal — ENOENT and other spawn errors log warnings, do not crash | VERIFIED | Both `spawnCaptureBridge()` and `spawnOutputBridge()` error handlers use `console.warn('[AudioRelay:capture/output] Bridge error: ...')` — confirmed no `this.emit('error')` in current code |
| 10 | Relay starts BEFORE createAudioCapture/createAudioOutput on WSL2 | VERIFIED | `src/index.ts` lines 51-61: relay block precedes audio pipeline block (lines 63-96) |
| 11 | Relay startup failure is non-fatal | VERIFIED | `src/index.ts` lines 54-60: relay creation wrapped in try/catch; warns and continues on failure |
| 12 | On native Linux, relay is never created | VERIFIED | `if (platform === 'wsl2')` guard at line 53; relay block is entirely skipped for non-WSL2 platforms |
| 13 | Shutdown stops relay after audio clients and before video feed | VERIFIED | `src/index.ts` shutdown order: session (line 185) → capture (line 188) → output (line 191) → relayServer (line 194) → videoFeed (line 197) → manager (line 200) |
| 14 | Relay listening log printed exactly once | VERIFIED | Log is in `WslAudioRelayServer.start()` line 33 using `config.audio.relayPort ?? RELAY_PORT`; `src/index.ts` has no `[AudioRelay]` log and no `RELAY_PORT` import |
| 15 | Setup guide covers VB-Cable, Chrome audio routing, ffmpeg install, device verification, operator monitoring | VERIFIED | `scripts/setup-wsl2-windows.md` Step 6 contains: VB-Cable (Step 2), Chrome audio routing, operator monitoring ("Listen to this device"), ffmpeg winget and manual install, device verification commands, config example |

**Score:** 15/15 code-level truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/audio/wsl2-relay-server.ts` | WslAudioRelayServer class — TCP relay + Windows bridge lifecycle | VERIFIED | 288 lines; exports `WslAudioRelayServer extends EventEmitter`; full TCP server, handshake parsing, capture/output bridges, auto-restart, shutdown |
| `src/config/schema.ts` | WSL2 audio device config fields | VERIFIED | `wsl2` section with `captureDevice`, `outputDeviceIndex`, `ffmpegPath`, `ffplayPath`; all with sensible defaults |
| `src/audio/index.ts` | Re-exports WslAudioRelayServer | VERIFIED | Line 6: `export { WslAudioRelayServer } from './wsl2-relay-server.js'` |
| `src/index.ts` | Relay lifecycle integrated into main() | VERIFIED | Import on line 10; start block lines 51-61; shutdown lines 194-196 |
| `scripts/setup-wsl2-windows.md` | Windows-side setup guide | VERIFIED | Step 6 "Audio Relay Setup" with all required sections |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/audio/wsl2-relay-server.ts` | `src/audio/wsl2-relay.ts` | `FrameReader, writeFrame, RELAY_PORT` imports | VERIFIED | Line 4: `import { FrameReader, writeFrame, RELAY_PORT } from './wsl2-relay.js'` |
| `src/audio/wsl2-relay-server.ts` | ffmpeg.exe / ffplay.exe | `child_process.spawn` with WSL2 interop | VERIFIED | `spawn(config.wsl2.ffmpegPath, ...)` and `spawn(config.wsl2.ffplayPath, ...)` both pass `{ env: process.env }` |
| `src/audio/wsl2-relay-server.ts` | `src/audio/wsl2-capture.ts` | TCP framing protocol — capture client sends `{type:'capture'}` handshake, receives framed PCM | VERIFIED | `setupCaptureClient()` registered on `handshake.type === 'capture'`; `writeFrame(captureClient, pcm)` sends framed PCM |
| `src/audio/wsl2-relay-server.ts` | `src/audio/wsl2-output.ts` | TCP framing protocol — output client sends `{type:'output'}` handshake and framed PCM | VERIFIED | `setupOutputClient()` registered on `handshake.type === 'output'`; `FrameReader` extracts PCM and writes to ffplay stdin |
| `src/index.ts` | `src/audio/wsl2-relay-server.ts` | Import and lifecycle management | VERIFIED | Line 10: `import { WslAudioRelayServer } from './audio/wsl2-relay-server.js'`; used in `main()` and `shutdown()` |

---

## Requirements Coverage

All three plans declare `requirements: [PLAT-02]`.

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| PLAT-02 | 06-01, 06-02, 06-03 | Works on Linux (WSL2) with appropriate device routing | VERIFIED (code) | TCP relay server bridges WSL2 Node.js ↔ Windows audio devices; platform guard ensures relay only runs on WSL2; relay eliminates ECONNREFUSED on WSL2 audio clients |

**Note on REQUIREMENTS.md traceability table:** The table at line 100 of REQUIREMENTS.md shows `PLAT-02 | Phase 1 | Complete`. This is stale — Phase 1 established the platform detection scaffolding but Phase 6 is the primary implementation of PLAT-02 (WSL2 audio routing). The traceability table should be updated to reference Phase 6 for PLAT-02. This is a documentation issue, not a code gap.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | No TODOs, stubs, empty handlers, or placeholder returns detected | — | — |

Specific checks performed:
- No `this.emit('error', err)` in `src/audio/wsl2-relay-server.ts` (confirmed fixed by Plan 06-03)
- No `return null`, `return {}`, or `return []` as stub returns
- No `console.log` as sole handler body
- No TODO/FIXME/PLACEHOLDER comments
- TypeScript compilation: `npx tsc --noEmit` passes with zero errors

---

## TypeScript Compilation

`npx tsc --noEmit` — PASS (zero errors, zero warnings)

---

## Human Verification Required

The following items cannot be verified without a WSL2 environment with Windows audio devices:

### 1. Audio relay starts on WSL2

**Test:** Run `npm run dev` from WSL2 terminal
**Expected:** Console shows `[AudioRelay] TCP relay listening on port 19876` exactly once. No ECONNREFUSED errors from `Wsl2AudioCapture` or `Wsl2AudioOutput` clients. Bridge startup messages appear (or graceful ENOENT warnings if ffmpeg.exe is not installed).
**Why human:** Requires WSL2 runtime with Windows process interop

### 2. Bridge processes connect to Windows audio

**Test:** With VB-Cable installed and ffmpeg/ffplay on Windows PATH, run `npm run dev` from WSL2
**Expected:** ffmpeg.exe captures from "CABLE Output (VB-Audio Virtual Cable)" without error. ffplay.exe starts and awaits PCM input. Both show expected stderr output (not ENOENT).
**Why human:** Requires VB-Cable driver and ffmpeg installed on the Windows host

### 3. Audio round-trip latency under 50ms

**Test:** Measure time from audio input at VB-Cable to framed PCM arriving at the Wsl2AudioCapture client
**Expected:** Latency under 50ms. The `-audio_buffer_size 50` ffmpeg flag constrains the capture buffer. TCP localhost adds negligible overhead.
**Why human:** Requires runtime timing measurement on WSL2 with live audio devices

### 4. Clean shutdown with no orphaned Windows processes

**Test:** Run `npm run dev` from WSL2, wait for bridge startup, then Ctrl+C. On Windows, run `tasklist | findstr ffmpeg`.
**Expected:** No ffmpeg.exe or ffplay.exe processes remain after shutdown. The `killBridge()` method calls `taskkill /F /T /PID` via powershell.exe to terminate the Windows process tree.
**Why human:** UAT test 6 was skipped because the app crashed before bridges started (pre-Plan-06-03). Now that the crash is fixed, this test needs a fresh run.

---

## Re-Verification Summary

Previous verification (`status: human_needed`) correctly identified that all code-level checks passed and only runtime/WSL2 tests were pending. Plan 06-03 (gap closure) fixed two UAT-identified blockers:

1. **Bridge error crash** — `this.emit('error', err)` in both bridge error handlers replaced with `console.warn()`. Confirmed absent in current `src/audio/wsl2-relay-server.ts`.
2. **Duplicate relay listening log** — Removed from `src/index.ts`; log exists only in `WslAudioRelayServer.start()`. Confirmed: `src/index.ts` contains no `[AudioRelay]` log and no `RELAY_PORT` import.

No regressions detected. All 15 code-level truths verified. 4 human-only items remain (runtime behavior on WSL2 with Windows audio hardware).

---

_Verified: 2026-03-25_
_Verifier: Claude (gsd-verifier)_
