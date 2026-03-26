---
phase: 02-audio-pipeline
plan: 03
status: complete
started: 2026-03-25
completed: 2026-03-25
duration_minutes: 4
---

# Plan 02-03 Summary: WSL2 Audio TCP Relay Bridge

## What Was Built
- TCP framing protocol: FrameReader (length-prefixed frame parser) and writeFrame utility
- Wsl2AudioCapture: TCP client that connects to Windows relay, receives PCM frames as Readable stream
- Wsl2AudioOutput: TCP client that connects to Windows relay, sends PCM frames via Writable stream
- Windows-side relay server (plain JS for portability): bridges TCP connections to parec/pacat subprocesses
- Full test suite for framing protocol (9 tests, all passing)

## Key Files

### Created
- `src/audio/wsl2-relay.ts` — FrameReader, writeFrame, RELAY_PORT, MESSAGE_TYPE
- `src/audio/wsl2-relay.test.ts` — 9 tests for framing protocol
- `src/audio/wsl2-capture.ts` — Wsl2AudioCapture implementing AudioCapture
- `src/audio/wsl2-output.ts` — Wsl2AudioOutput implementing AudioOutput
- `scripts/wsl2-audio-relay.js` — Windows-side Node.js relay server

## Decisions Made
- TCP relay uses length-prefixed framing (4-byte LE uint32 + payload)
- JSON handshake as first frame: { type: 'capture'|'output', sink: string }
- Windows relay server is plain JS (no TypeScript) for direct node.exe execution
- Default relay port: 19876

## Self-Check: PASSED
- [x] FrameReader correctly handles partial, complete, and multi-frame inputs
- [x] writeFrame + FrameReader round-trip preserves data
- [x] WSL2 capture/output classes implement AudioCapture/AudioOutput interfaces
- [x] Windows relay script syntax-valid
- [x] All 9 tests pass
- [x] TypeScript compiles
