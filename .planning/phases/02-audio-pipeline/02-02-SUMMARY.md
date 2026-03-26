---
phase: 02-audio-pipeline
plan: 02
status: complete
started: 2026-03-25
completed: 2026-03-25
duration_minutes: 5
---

# Plan 02-02 Summary: Native Linux Audio Capture and Output

## What Was Built
- NativeAudioCapture class: parec subprocess wrapper with auto-reconnect and RMS level events
- NativeAudioOutput class: pacat subprocess wrapper with RMS level events
- Both use dependency injection for spawn function (testable without real PulseAudio)
- Full test suites (7 capture tests, 6 output tests, all passing)

## Key Files

### Created
- `src/audio/capture.ts` — NativeAudioCapture implementing AudioCapture interface
- `src/audio/capture.test.ts` — 7 unit tests with mocked spawn
- `src/audio/output.ts` — NativeAudioOutput implementing AudioOutput interface
- `src/audio/output.test.ts` — 6 unit tests with mocked spawn

## Decisions Made
- Used dependency injection for child_process.spawn (ESM modules are read-only, can't mock directly)
- parec uses `--latency-msec 20` for low latency capture
- RMS level events emit every ~8000 bytes (~250ms at 16kHz/16-bit/mono)
- Auto-reconnect on capture only (output is caller-controlled)

## Self-Check: PASSED
- [x] NativeAudioCapture spawns parec with correct args
- [x] NativeAudioOutput spawns pacat with correct args
- [x] Auto-reconnect works on capture
- [x] RMS level events emitted
- [x] All 13 tests pass
- [x] TypeScript compiles
