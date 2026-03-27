# Roadmap: AI Meet Agent

## Overview

Five phases take the project from bare OS environment to a fully operational AI digital twin on a Google Meet call. Phase 1 resolves the highest-risk architecture unknown (WSL2 device visibility) before any pipeline code is written. Phases 2 and 3 build the audio and video foundations independently. Phase 4 wires in the Gemini Live AI layer. Phase 5 completes the bidirectional loop, adds persona configuration, and gives the operator visibility into what the twin is doing. Each phase delivers one independently verifiable capability; the next phase can only build on a working prior one.

Phase 6 was an insertion to build the WSL2 audio relay server that bridges WSL2 Node.js to VB-Cable on Windows — a gap discovered during Phase 2 execution.

Milestone v1.1 (Cleaner API) adds phases 7–9. These replace the raw `npm run dev` workflow with an installable CLI tool, add file-based configuration, introduce a provider abstraction layer, and unify error handling across the system.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

### v1.0 Phases (Complete)

- [x] **Phase 1: Virtual Device Setup** - Virtual camera and microphone appear in browser device selector on both native Linux and WSL2 (completed 2026-03-26)
- [x] **Phase 2: Audio Pipeline** - Audio captured from Meet participants and playable through virtual mic with echo-free topology (completed 2026-03-26)
- [x] **Phase 3: Static Video Feed** - Static placeholder image streams to virtual camera at consistent frame rate (completed 2026-03-26)
- [x] **Phase 4: AI Integration** - Gemini Live WebSocket session receives audio chunks and returns AI audio responses (completed 2026-03-26)
- [x] **Phase 5: End-to-End Loop and Operator Experience** - Full bidirectional AI conversation works in a live Meet call with configurable persona and operator monitoring (completed 2026-03-26)
- [x] **Phase 6: WSL2 Audio Relay Server** - TCP relay server bridges audio between WSL2 Node.js and VB-Cable on Windows (completed 2026-03-26)

### v1.1 Phases (Cleaner API)

- [ ] **Phase 7: Foundations** - Provider abstraction interface, typed error hierarchy, and role file loader in place as infrastructure for the CLI layer
- [ ] **Phase 8: CLI Entry Point and Subcommands** - Installable `ai-meet` binary with all subcommands, flags, and file-based config working end-to-end
- [ ] **Phase 9: Error Handling and Distribution Readiness** - Actionable error messages at every failure point and package ready for `npm install -g` distribution

## Phase Details

### Phase 1: Virtual Device Setup
**Goal**: Virtual camera and microphone devices are visible and selectable in Chrome's device picker on both native Linux and WSL2
**Depends on**: Nothing (first phase)
**Requirements**: VDEV-01, VDEV-02, PLAT-01, PLAT-02
**Success Criteria** (what must be TRUE):
  1. Chrome on the target environment (native Linux or WSL2) lists a virtual camera device (e.g. "Mock Input") in the webcam selector
  2. Chrome on the target environment lists a virtual microphone device (e.g. "Mock Input") in the mic selector
  3. WSL2 browser environment decision is made and documented — either Chrome inside WSL2 via WSLg or Chrome on Windows with virtual device bridges
  4. v4l2loopback module loads successfully in the target environment (confirmed via `lsmod | grep v4l2loopback`)
  5. PulseAudio/PipeWire null-sink and virtual-source are created and visible to the browser without crashing or erroring on start
**Plans:** 5/5 plans complete

Plans:
- [x] 01-01-PLAN.md — TypeScript project bootstrap, config schema (Zod), platform detection
- [x] 01-02-PLAN.md — Native Linux device layer: prerequisites, VirtualCamera, VirtualAudioDevices, DeviceManager
- [x] 01-03-PLAN.md — Setup script, test-devices CLI, main entry point
- [x] 01-04-PLAN.md — WSL2 probe, architecture decision, docs, human verification checkpoint
- [ ] 01-05-PLAN.md — Gap closure: wire WSL2 platform branching into DeviceManager and CLI entry points

### Phase 2: Audio Pipeline
**Goal**: Meet participant audio is captured from Chrome's output into a Node.js stream, and PCM audio can be played back through the virtual microphone — with the capture and output paths architecturally isolated to prevent feedback loops
**Depends on**: Phase 1
**Requirements**: AUDI-01, AUDI-04
**Success Criteria** (what must be TRUE):
  1. Playing audio in Chrome (e.g. a YouTube video or Meet call) produces a readable PCM stream in the Node.js process
  2. Writing a known PCM audio clip to the output path causes it to play through the virtual microphone source (audible to a second device joined to the same Meet call)
  3. Running both capture and output simultaneously does not produce an audio feedback loop — the AI output path never reaches the capture path
  4. Audio format is confirmed (sample rate, bit depth, channel count) and typed conversion utilities are tested against known PCM data
**Plans**: TBD

### Phase 3: Static Video Feed
**Goal**: A static JPEG image streams continuously to the virtual camera device at a consistent frame rate, appearing as a live webcam to Google Meet
**Depends on**: Phase 1
**Requirements**: VDEV-03
**Success Criteria** (what must be TRUE):
  1. Joining a Google Meet and selecting the virtual camera displays the placeholder image as the video feed (not a black screen or frozen frame indicator)
  2. The video feed continues without stutter or dropout for at least 10 minutes without intervention
  3. The ffmpeg subprocess is started and stopped cleanly by the orchestrator (no zombie processes on SIGINT)
**Plans:** 2/2 plans complete

Plans:
- [ ] 03-01-PLAN.md — Video module: types, NativeVideoFeed (v4l2), Wsl2VideoFeed (MJPEG), factory, config, placeholder
- [ ] 03-02-PLAN.md — Integration into main() with lifecycle management, WSL2 OBS docs, human verification

### Phase 4: AI Integration
**Goal**: Audio chunks from the capture stream are sent to Gemini Live API over a persistent WebSocket, and AI audio responses are received back — with correct audio format, session reconnection logic, and latency instrumentation in place
**Depends on**: Phase 2
**Requirements**: AUDI-02, AUDI-03, AUDI-05, CONV-01
**Success Criteria** (what must be TRUE):
  1. Speaking into a microphone connected to the Meet call causes the Gemini Live WebSocket session to receive audio and return an AI audio response
  2. AI audio responses play through the virtual microphone and are audible to other Meet participants
  3. End-to-end audio round-trip (speech in to AI speech out) is measured at under 2 seconds in normal network conditions
  4. The AI session reconnects automatically after disconnection (simulated by killing the WebSocket) without operator intervention
  5. A persona system prompt (name, role, background) is sent to the AI on session start and the AI introduces itself consistently with that persona
**Plans**: TBD

### Phase 5: End-to-End Loop and Operator Experience
**Goal**: The full bidirectional AI conversation loop runs stably in a live Google Meet call, with per-meeting context injection, conversation memory, and operator monitoring tools working
**Depends on**: Phase 4
**Requirements**: CONV-02, CONV-03, OPER-01, OPER-02
**Success Criteria** (what must be TRUE):
  1. The operator can run a single CLI command with a config file and have the full system (virtual devices, video feed, audio pipeline, AI session) start and run without additional manual steps
  2. Meeting-specific context (agenda, attendee bios) injected via config is reflected in the AI's responses during the call
  3. The AI references earlier parts of the conversation correctly — it does not forget context from the beginning of a call
  4. The operator can hear both Meet participants and the AI's responses in their local audio environment without joining the call as a second participant
  5. A live transcript display shows participant speech and AI responses as the call progresses
**Plans:** 3 plans

Plans:
- [ ] 05-01-PLAN.md — Meeting context loader, CLI arg parsing, system prompt extension
- [ ] 05-02-PLAN.md — Transcript writer, Gemini TEXT+AUDIO modality, text event emission
- [ ] 05-03-PLAN.md — Operator audio monitor, full end-to-end integration, critical path enforcement

### Phase 6: WSL2 Audio Relay Server
**Goal**: TCP relay server on port 19876 bridges audio between WSL2 Node.js process and VB-Cable on Windows, completing the WSL2 audio path that Phase 2 capture/output clients expect
**Depends on**: Phase 5
**Requirements**: PLAT-02
**Success Criteria** (what must be TRUE):
  1. A TCP server listens on port 19876 inside WSL2 and accepts connections from Wsl2AudioCapture and Wsl2AudioOutput clients
  2. Audio captured from Google Meet (via Windows audio routing) is received by the relay and forwarded to the capture client as PCM frames
  3. PCM audio written by the output client is forwarded by the relay to VB-Cable's CABLE Input on Windows
  4. The relay starts automatically as part of `npm run dev` — no separate process needed
  5. Audio round-trip through the relay adds less than 50ms of latency
**Plans**: 3/3 plans complete

Plans:
- [x] 06-01-PLAN.md — TCP relay server, Wsl2AudioCapture, Wsl2AudioOutput clients
- [x] 06-02-PLAN.md — Lifecycle integration into main(), WSL2 setup docs, Windows bridge configuration
- [x] 06-03-PLAN.md — DirectSound routing fix, VoiceMeter integration, end-to-end audio path

### Phase 7: Foundations
**Goal**: The infrastructure that the CLI layer depends on — typed error hierarchy, AI provider interface, GeminiProvider adapter, and role file loader — is in place and validated before any command handler code is written
**Depends on**: Phase 6
**Requirements**: PROV-01, PROV-02, CFG-03
**Success Criteria** (what must be TRUE):
  1. `src/errors/index.ts` exports a typed `AgentError` class hierarchy — calling code can catch a typed error and read `.message`, `.hint`, and `.exitCode` from it
  2. `src/ai/provider.ts` exports a `RealtimeAudioProvider` interface; a `MockProvider` stub implements it and compiles cleanly — confirming the interface is shaped around the consumer, not around Gemini internals
  3. `src/ai/gemini-provider.ts` exports a `GeminiProvider` class that wraps `GeminiLiveSession` via the adapter pattern without modifying `GeminiLiveSession` — existing live session behaviour is unchanged
  4. Passing `--role path/to/role.md` (or a JSON file) merges the file contents into `Config.persona` — the AI twin's name and background are loaded from disk rather than hardcoded
**Plans:** 3 plans

Plans:
- [ ] 07-01-PLAN.md — TDD: AgentError class hierarchy (typed errors with hints and exit codes)
- [ ] 07-02-PLAN.md — TDD: RealtimeAudioProvider interface and MockProvider
- [ ] 07-03-PLAN.md — GeminiProvider adapter, role file loader, export wiring

### Phase 8: CLI Entry Point and Subcommands
**Goal**: The `ai-meet` binary is installable, all subcommands work, and file-based configuration (`--config`, `--notes`, `--role`) is fully wired — replacing `npm run dev` as the normal operator workflow
**Depends on**: Phase 7
**Requirements**: CLI-01, CLI-02, CLI-03, CLI-04, CMD-01, CMD-02, CMD-03, CMD-04, CFG-01, CFG-02
**Success Criteria** (what must be TRUE):
  1. Running `npm install -g .` from the project root and then `ai-meet --version` from `/tmp` prints the version string — the binary is globally installed and resolves paths correctly from outside the project directory
  2. Running `npx ai-meet start` without a global install launches the meeting session — the `npx` path works end-to-end
  3. Running `ai-meet --help` lists all available subcommands; running `ai-meet start --help` lists all flags for the start command
  4. Running `ai-meet list-devices` outputs the available audio input/output and video devices, including the correct Windows device names on WSL2
  5. Running `ai-meet test-audio` runs the device verification check and reports pass/fail without starting a full meeting session
  6. Running `ai-meet start --config <path> --notes <path>` launches a session with the specified config file and meeting notes loaded — no manual editing of hardcoded paths required
**Plans**: TBD

### Phase 9: Error Handling and Distribution Readiness
**Goal**: Every critical failure point surfaces an actionable message with a fix hint instead of a raw stack trace, and the package is ready for `npm install -g` distribution
**Depends on**: Phase 8
**Requirements**: ERR-01, ERR-02, ERR-03
**Success Criteria** (what must be TRUE):
  1. Running `ai-meet start` without `ffmpeg` installed prints a clear message naming the missing dependency and the exact install command to fix it — not a Node.js stack trace
  2. Providing a config file with a missing or invalid field prints the field name and expected value/type — not a raw Zod error dump
  3. An AI session failure (e.g. missing API key, network drop) exits with a clear message and non-zero exit code; a video feed failure (non-critical) logs a warning and the session continues without video
**Plans**: TBD

## Progress

**Execution Order:**
v1.0: 1 → 2 → 3 → 4 → 5 → 6
v1.1: 7 → 8 → 9

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Virtual Device Setup | 4/4 | Complete | 2026-03-26 |
| 2. Audio Pipeline | 0/TBD | Complete | 2026-03-26 |
| 3. Static Video Feed | 2/2 | Complete | 2026-03-26 |
| 4. AI Integration | 0/TBD | Complete | 2026-03-26 |
| 5. End-to-End Loop and Operator Experience | 3/3 | Complete | 2026-03-26 |
| 6. WSL2 Audio Relay Server | 3/3 | Complete | 2026-03-26 |
| 7. Foundations | 0/3 | Not started | - |
| 8. CLI Entry Point and Subcommands | 0/TBD | Not started | - |
| 9. Error Handling and Distribution Readiness | 0/TBD | Not started | - |
