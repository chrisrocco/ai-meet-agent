# Roadmap: AI Meet Agent

## Overview

Five phases take the project from bare OS environment to a fully operational AI digital twin on a Google Meet call. Phase 1 resolves the highest-risk architecture unknown (WSL2 device visibility) before any pipeline code is written. Phases 2 and 3 build the audio and video foundations independently. Phase 4 wires in the Gemini Live AI layer. Phase 5 completes the bidirectional loop, adds persona configuration, and gives the operator visibility into what the twin is doing. Each phase delivers one independently verifiable capability; the next phase can only build on a working prior one.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Virtual Device Setup** - Virtual camera and microphone appear in browser device selector on both native Linux and WSL2 (completed 2026-03-26)
- [x] **Phase 2: Audio Pipeline** - Audio captured from Meet participants and playable through virtual mic with echo-free topology (completed 2026-03-26)
- [x] **Phase 3: Static Video Feed** - Static placeholder image streams to virtual camera at consistent frame rate (completed 2026-03-26)
- [x] **Phase 4: AI Integration** - Gemini Live WebSocket session receives audio chunks and returns AI audio responses (completed 2026-03-26)
- [ ] **Phase 5: End-to-End Loop and Operator Experience** - Full bidirectional AI conversation works in a live Meet call with configurable persona and operator monitoring
- [ ] **Phase 6: WSL2 Audio Relay Server** - TCP relay server bridges audio between WSL2 Node.js and VB-Cable on Windows

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
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

Note: Phase 3 depends only on Phase 1 and can be built concurrently with Phase 2 if bandwidth allows, but for sequential execution it follows Phase 2.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Virtual Device Setup | 4/4 | Complete    | 2026-03-26 |
| 2. Audio Pipeline | 0/TBD | Complete    | 2026-03-26 |
| 3. Static Video Feed | 2/2 | Complete   | 2026-03-26 |
| 4. AI Integration | 0/TBD | Complete    | 2026-03-26 |
| 5. End-to-End Loop and Operator Experience | 0/TBD | Not started | - |
| 6. WSL2 Audio Relay Server | 0/TBD | Not started | - |

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
**Plans**: TBD

Plans:
- [ ] TBD (run /gsd:plan-phase 6 to break down)
