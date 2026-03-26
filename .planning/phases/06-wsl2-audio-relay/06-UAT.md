---
status: diagnosed
phase: 06-wsl2-audio-relay
source: 06-01-SUMMARY.md, 06-02-SUMMARY.md
started: 2026-03-25T20:00:00Z
updated: 2026-03-25T20:05:00Z
---

## Current Test

[testing complete]

## Tests

### 1. TypeScript compiles with WSL2 config schema
expected: Running `npx tsc --noEmit` completes with no errors. The wsl2 config section is accepted by the type system.
result: pass

### 2. Relay server starts on WSL2
expected: Running `npm run dev` from WSL2 shows `[AudioRelay] TCP relay listening on port 19876` in the console output. No ECONNREFUSED errors from audio clients.
result: issue
reported: "Listening message printed twice. App crashes with unhandled error: spawn ffmpeg.exe ENOENT — the ChildProcess error event on WslAudioRelayServer is not caught, crashes the entire process instead of being non-fatal."
severity: blocker

### 3. Relay skipped on native Linux
expected: Running the app on native Linux (not WSL2) does NOT start the relay server — no relay log messages appear, and the app starts normally without errors.
result: skipped
reason: Only WSL2 environment available — cannot test native Linux behavior

### 4. Relay failure is non-fatal
expected: If the relay cannot start (e.g., port 19876 already in use), the app logs a warning but continues running. Audio clients may fail to connect, but the app doesn't crash.
result: issue
reported: "App crashes with unhandled 'error' event from ChildProcess on WslAudioRelayServer when ffmpeg.exe is not found (ENOENT). The error bubbles up and kills the process instead of being caught and logged as a warning."
severity: blocker

### 5. Setup guide exists and is comprehensive
expected: `scripts/setup-wsl2-windows.md` exists and contains sections for: VB-Cable installation, Chrome audio routing, ffmpeg/ffplay installation, device verification commands, and operator monitoring setup ("Listen to this device").
result: pass

### 6. Clean shutdown with no orphaned processes
expected: After stopping the app (Ctrl+C), no orphaned ffmpeg.exe or ffplay.exe processes remain on Windows. Running `tasklist | findstr ffmpeg` on Windows shows no leftover processes.
result: skipped
reason: App crashes before bridges start — cannot test clean shutdown until crash is fixed

## Summary

total: 6
passed: 2
issues: 2
pending: 0
skipped: 2

## Gaps

- truth: "Relay server starts on WSL2 and listens on port 19876 without crashing"
  status: failed
  reason: "User reported: Listening message printed twice. App crashes with unhandled error: spawn ffmpeg.exe ENOENT — the ChildProcess error event on WslAudioRelayServer is not caught, crashes the entire process instead of being non-fatal."
  severity: blocker
  test: 2
  root_cause: "Duplicate log: message printed in both WslAudioRelayServer.start() (line 33) and src/index.ts (line 58). Crash: spawnCaptureBridge/spawnOutputBridge re-emit ChildProcess errors onto WslAudioRelayServer via this.emit('error', err), but no error listener is registered on the instance in src/index.ts."
  artifacts:
    - path: "src/audio/wsl2-relay-server.ts"
      issue: "Lines 223-225 and 260-262: bridge error handlers re-emit onto class instance"
    - path: "src/index.ts"
      issue: "Lines 56-63: no .on('error') listener registered on relayServer"
  missing:
    - "Remove duplicate log message from either wsl2-relay-server.ts:33 or index.ts:58"
    - "Add relayServer.on('error', ...) in index.ts OR change bridge error handlers to console.warn instead of re-emitting"

- truth: "Relay failure is non-fatal — app logs warning and continues"
  status: failed
  reason: "User reported: App crashes with unhandled 'error' event from ChildProcess on WslAudioRelayServer when ffmpeg.exe is not found (ENOENT). The error bubbles up and kills the process instead of being caught and logged as a warning."
  severity: blocker
  test: 4
  root_cause: "Same root cause as test 2 — ChildProcess 'error' events are re-emitted onto WslAudioRelayServer with no listener, causing Node.js to throw unhandled error and crash the process."
  artifacts:
    - path: "src/audio/wsl2-relay-server.ts"
      issue: "Lines 223-225 and 260-262: this.emit('error', err) with no consumer"
  missing:
    - "Bridge spawn errors must be caught and logged as warnings, not propagated as fatal errors"
