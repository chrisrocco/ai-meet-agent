# Project Research Summary

**Project:** AI Meet Agent
**Domain:** AI virtual meeting participant — virtual audio/video devices + realtime AI conversation pipeline on Linux/WSL2
**Researched:** 2026-03-25
**Confidence:** MEDIUM

## Executive Summary

The AI Meet Agent is a conversational AI digital twin that participates in Google Meet calls by presenting itself as a webcam source and microphone input through standard Linux virtual device mechanisms. Unlike the existing category of meeting bots (Recall.ai, Otter.ai, Fireflies.ai) which are passive observers that transcribe and record, this product actively speaks as a participant — occupying genuine meeting presence through virtual device selection rather than browser automation. The recommended architecture is a six-layer pipeline: virtual OS-level devices (v4l2loopback for camera, PipeWire/PulseAudio null-sink for audio), audio capture via subprocess streams, bidirectional WebSocket connection to Gemini Live API, audio output back through a virtual microphone, and a static image video feed. These layers are well-understood individually; the challenge is composing them reliably, especially on WSL2.

The most critical recommendation is to treat WSL2 compatibility as a first-class architecture constraint, not a footnote. The fundamental problem is that Chrome on Windows cannot see Linux virtual devices — neither `/dev/videoN` V4L2 devices nor PulseAudio null-sinks are visible to a Windows host browser. The project must make an early, explicit decision: run Chrome inside WSL2 via WSLg (Linux virtual devices work, more complex display setup) or run Chrome on Windows and bridge audio/video through Windows-side virtual device tools like VB-Cable and OBS Virtual Camera. This decision shapes the entire pipeline design and must come before any audio or video code is written.

The primary technical risk beyond WSL2 is achieving sub-2-second end-to-end conversational latency. The pipeline has five sequential latency stages; each must be actively tuned. Gemini Live API (WebSocket bidirectional streaming) is the correct AI integration approach — a traditional STT+LLM+TTS pipeline adds 2-4 seconds of HTTP round-trip overhead that makes the sub-2s target impossible. However, the Gemini Live API package name, audio format requirements, and Node.js server-side support all need verification against current documentation before coding begins, as this API was relatively new as of the research knowledge cutoff.

---

## Key Findings

### Recommended Stack

The stack is anchored by Node.js 22 LTS with TypeScript for the orchestration layer, with audio I/O delegated to native subprocesses (`parec`/`pacat` for PulseAudio, `pw-record`/`pw-play` for PipeWire) piped through Node.js streams. This avoids native addon build complexity while keeping audio I/O off the Node.js event loop. The video feed is handled by an `ffmpeg` subprocess writing MJPEG frames to v4l2loopback — simple and reliable for a static placeholder image.

**Core technologies:**
- `@google/genai` (verify current package name): Gemini Live API client — only viable option for sub-2s bidirectional audio conversation with a single Google vendor
- `v4l2loopback` (kernel module) + `ffmpeg`: Virtual camera device — canonical Linux solution, unchanged approach for 10+ years
- PipeWire / PulseAudio `module-null-sink` + `module-virtual-source`: Virtual microphone and audio capture — userspace, no kernel module required, browser-visible on native Linux
- `naudiodon` or subprocess-based audio I/O: PCM stream handling — subprocess approach preferred for WSL2 reliability
- `commander` + `zod` + `dotenv`: CLI, config validation, secrets — all HIGH confidence, stable packages
- `tsx` + `tsup`: TypeScript dev/build toolchain — faster than ts-node, esbuild-based

**MEDIUM confidence items requiring verification before coding:**
- `@google/genai` npm package name and whether Gemini Live (`BidiGenerateContent`) WebSocket API is available server-side in Node.js (not browser-only)
- Gemini Live audio format: 16kHz 16-bit mono PCM assumed, must confirm
- `naudiodon` Node.js 22 compatibility and pre-built binary availability

### Expected Features

**Must have (table stakes) — all required for v1 to function:**
- Virtual V4L2 camera device visible in browser — gate for all video
- Virtual PulseAudio/PipeWire microphone source visible in browser — gate for all audio output
- Capture Google Meet participant audio from browser output — the hardest unsolved problem
- Realtime audio streaming to Gemini Live API (WebSocket, not HTTP) — latency requirement demands this
- AI audio response played through virtual microphone — completes the bidirectional loop
- Static placeholder image fed to virtual camera at consistent frame rate — browser mutes camera if no stream
- Configurable persona via system prompt (name, role, meeting context) — core product behavior
- Voice Activity Detection (VAD) — nearly table stakes; without it the AI responds to noise and burns API quota; Gemini Live may handle this server-side
- Echo cancellation via audio routing topology (virtual mic output path isolated from capture path) — must be architectural, not software filter

**Should have (differentiators, post-v1 MVP):**
- Live transcript display for operator monitoring
- Per-meeting context injection (agenda, attendee bios prepended to prompt)
- Session summary generation at call end (trivial once transcript exists)
- Configurable response style parameters in system prompt
- Conversation memory / context window management for long calls

**Defer to v2+:**
- Operator override / intervene capability — adds IPC complexity; validate loop first
- Participant join/leave awareness — requires DOM scraping, explicitly out of scope
- AI-generated video / avatar — GPU-intensive, high latency, not conversational value
- Browser automation for auto-join — fragile against Meet UI changes
- Multi-call support, cloud deployment, Zoom/Teams support

### Architecture Approach

The system is a pipeline of six distinct layers with a latency-critical audio loop as the primary data path. Data flows: Meet browser audio output → virtual sink → audio capture subprocess → Node.js stream → Gemini Live WebSocket → AI response audio → audio output subprocess → virtual microphone source → Meet browser input. A separate, independent path handles video: static image file → ffmpeg subprocess → v4l2loopback → browser camera. The orchestrator layer manages startup ordering, subprocess lifecycle, graceful teardown, and SIGINT/SIGTERM handling. The key architectural principle is that Node.js is the coordinator, not the audio processor — all real-time I/O lives in subprocesses.

**Major components:**
1. **Virtual Device Setup** — loads v4l2loopback kernel module and creates PulseAudio/PipeWire null-sink + virtual-source; must run before everything else
2. **Audio Capture Module** — `parec`/`pw-record` subprocess piped to Node.js readable stream; produces chunked PCM at 16kHz mono
3. **AI Client (Gemini Live)** — persistent WebSocket session; sends audio chunks, receives audio response chunks asynchronously; manages session state, persona, reconnection
4. **Audio Output Module** — Node.js writable stream piped to `pacat`/`pw-play` subprocess; writes AI response PCM to virtual microphone source
5. **Video Feed Module** — ffmpeg subprocess looping static image to `/dev/videoN` at consistent frame rate
6. **Orchestrator / CLI** — startup ordering, lifecycle management, error recovery, graceful teardown via SIGINT handler

### Critical Pitfalls

1. **WSL2 browser cannot see Linux virtual devices** — Chrome on Windows uses Windows audio/camera (WASAPI/DirectShow), not Linux PulseAudio or V4L2. Must decide in Phase 1: run Chrome inside WSL2 via WSLg, or use Windows-side virtual device bridges (VB-Cable for audio, OBS Virtual Camera for video). This is an architecture-level decision, not a configuration tweak.

2. **v4l2loopback requires custom WSL2 kernel** — WSL2 Microsoft kernel does not include v4l2loopback. `apt install v4l2loopback-dkms` appears to succeed but `modprobe` fails. Must compile against WSL2 kernel headers or use a custom kernel configured via `.wslconfig`. Detect immediately in Phase 1 by running `lsmod | grep v4l2loopback` after load attempt.

3. **Audio feedback loop — AI hears its own voice** — Without topological audio isolation, the virtual mic output routes back through the capture path. The AI hears its own response, generates a reply to itself, and loops. Prevention: separate virtual sinks for capture and output paths so they never overlap; implement a "speaking" gate that suppresses capture while AI audio plays.

4. **Latency accumulation exceeds 2-second conversational threshold** — Each pipeline stage adds 50-200ms; combined easily reaches 3-4 seconds without active tuning. Prevention: instrument each stage early with `Date.now()` timestamps; use streaming PCM throughout (never buffer full utterances); pre-warm the WebSocket connection; set aggressive chunk sizes (100ms / 1600 samples at 16kHz).

5. **Gemini Live API session expiry mid-call** — Sessions expire (likely 15-30 minutes); without reconnection logic the AI twin goes silent. Prevention: implement WebSocket reconnection with exponential backoff and persona context re-injection from day one of API integration, not post-MVP.

---

## Implications for Roadmap

Based on combined research, the following phase structure is recommended. Dependencies between layers drive the ordering — each phase must be validated independently before the next begins.

### Phase 1: Environment Validation and Virtual Device Setup

**Rationale:** All other phases depend on virtual devices being visible in the target browser. WSL2 compatibility is the highest-risk unknown and must be resolved first. The browser environment decision (Chrome in WSL2 vs. Chrome on Windows) determines the entire architecture of the audio and video pipeline. This cannot be skipped or deferred.

**Delivers:** Working virtual camera and virtual microphone visible in Chrome's device selector; documented WSL2 setup path; clear decision on browser location; system device naming strategy established

**Addresses:** Table stakes features — virtual camera device, virtual microphone device, Linux platform support

**Avoids:** Pitfall 1 (v4l2loopback WSL2 custom kernel), Pitfall 2 (Chrome/Windows not seeing Linux devices), Pitfall 3 (PulseAudio invisible to Windows browser), Pitfall 7 (stale device enumeration)

**Research flag:** Needs research-phase — WSL2 kernel compilation, WSLg audio behavior, OBS Virtual Camera API, VB-Cable Windows routing are all environment-specific and need hands-on validation

### Phase 2: Audio Pipeline Architecture

**Rationale:** Audio routing is the hardest unsolved problem and the foundation for all subsequent work. Audio capture from Meet must be isolated to Meet's audio only (not all system audio). Echo cancellation topology must be designed before any end-to-end test. Node.js GC impact on audio I/O must be addressed via subprocess delegation. Get audio flowing and validated before adding the AI layer.

**Delivers:** Working audio capture from Chrome's audio output (Meet-isolated), working PCM stream in Node.js, working audio playback to virtual microphone, typed audio conversion utilities tested in isolation, confirmed echo-free routing topology

**Addresses:** Audio capture from Meet participants, echo cancellation (architectural), Node.js real-time audio constraints

**Avoids:** Pitfall 4 (audio feedback loop), Pitfall 8 (Node.js GC audio glitches), Pitfall 9 (Meet audio not isolated from system audio), Pitfall 14 (TypeScript buffer conversion errors)

**Uses:** PulseAudio/PipeWire null-sink pattern, subprocess stream pattern (`parec`/`pacat` or `pw-record`/`pw-play`), Node.js streams

**Research flag:** Standard patterns for subprocess audio — skip research-phase. Audio isolation with Chrome `--audio-output-device` flag needs verification against current Chrome version.

### Phase 3: Static Video Feed

**Rationale:** Video feed is independent of audio and has no unsolved problems. Once the virtual camera device exists (Phase 1), this is a deterministic ffmpeg command. Completing it quickly closes the video portion of the MVP, allowing Phase 4-5 to focus entirely on the harder audio AI integration.

**Delivers:** Static placeholder JPEG displayed as virtual webcam in Meet, consistent 30fps frame delivery, ffmpeg subprocess managed by orchestrator lifecycle

**Addresses:** Static placeholder video frame (table stakes), virtual camera device validation under real Meet conditions

**Avoids:** Pitfall 11 (frame rate mismatch causing stutter)

**Uses:** v4l2loopback + ffmpeg subprocess, Orchestrator lifecycle pattern

**Research flag:** Well-documented pattern — skip research-phase.

### Phase 4: AI API Integration (Gemini Live)

**Rationale:** This is the core intelligence layer and the highest-complexity integration. Must be built on a working audio capture foundation (Phase 2). VAD must be implemented here before connecting to the paid API to avoid streaming silence. Session reconnection logic must be built at initial integration. API format requirements must be verified before the first call.

**Delivers:** Working Gemini Live WebSocket session, audio chunks from Phase 2 sent to API, AI audio response received and logged (no output yet), VAD gate preventing silence transmission, confirmed audio format handling (16kHz mono PCM)

**Addresses:** Realtime audio streaming to AI API, VAD (nearly table stakes), Gemini Live session management

**Avoids:** Pitfall 5 (latency accumulation — instrument here), Pitfall 6 (session expiry without reconnection), Pitfall 10 (streaming silence burns quota), Pitfall 13 (audio format mismatch)

**Uses:** `@google/genai` SDK (verify package name), WebSocket streaming pattern, PCM chunking at ~100ms, Gemini Live setup message schema

**Research flag:** Needs research-phase — verify `@google/genai` current package name and API surface, Gemini Live Node.js server-side availability, audio format requirements, session limits, and VAD behavior. This API had active development as of the knowledge cutoff.

### Phase 5: End-to-End Bidirectional Audio Loop and Persona Config

**Rationale:** Wire Phase 2 (audio capture) output into Phase 4 (AI client) and wire Phase 4 AI response audio into virtual microphone output. This completes the MVP loop. Persona config is low-complexity and required for the system to have identity. Latency instrumentation and optimization happen here.

**Delivers:** Full conversational AI twin — Meet participant audio → AI → virtual microphone; configurable persona via JSON/YAML config file; end-to-end latency measured and within 2s target; orchestrator managing full startup/teardown lifecycle

**Addresses:** Full table stakes feature set, persona configuration, sub-2s latency requirement, graceful startup/teardown

**Avoids:** Pitfall 5 (latency — active optimization here), Pitfall 4 (feedback loop — final validation with real audio)

**Uses:** All prior phases integrated; `commander` CLI, `zod` persona config validation, SIGINT/SIGTERM handlers

**Research flag:** Integration work — skip research-phase. Optimization may need profiling but patterns are well-documented.

### Phase Ordering Rationale

- **Phase 1 before everything:** WSL2 device visibility is an architecture-level unknown. The wrong answer here invalidates all subsequent pipeline design.
- **Phase 2 before Phase 4:** Audio capture must be proven independently. Debugging a combined capture+AI failure is exponentially harder than isolated failures.
- **Phase 3 parallel to Phase 2:** Video feed has no dependency on audio; can be built concurrently in practice if bandwidth allows.
- **Phase 4 after Phase 2:** AI integration requires a working audio input stream. VAD and format validation are easier to test against a known-good capture stream.
- **Phase 5 last:** Integration phase assumes all components are independently validated.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** WSL2-specific — v4l2loopback custom kernel compilation, WSLg audio behavior, Windows-side virtual device options (OBS Virtual Camera API, VB-Cable configuration). These require hands-on environment validation.
- **Phase 4:** Gemini Live API — package name, Node.js server-side availability, audio format specification, session limits, VAD configuration. API was in active development at knowledge cutoff; current docs are authoritative.

Phases with standard patterns (skip research-phase):
- **Phase 2:** PulseAudio subprocess streaming is a well-established pattern with abundant documentation.
- **Phase 3:** v4l2loopback + ffmpeg static image loop is canonical and unchanged for years.
- **Phase 5:** Integration and optimization of proven components; profiling guidance is standard Node.js knowledge.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Core choices (Node.js, TypeScript, v4l2loopback, ffmpeg, PipeWire) are HIGH confidence. Gemini Live `@google/genai` package name and Node.js server-side API availability are MEDIUM — need verification before Phase 4 |
| Features | HIGH | Feature landscape is well-understood from competitor analysis and domain patterns. VAD server-side behavior in Gemini Live is MEDIUM |
| Architecture | HIGH for patterns, MEDIUM for WSL2 specifics | Subprocess streaming, v4l2loopback, PulseAudio null-sink patterns are HIGH confidence. WSL2 audio/video passthrough behavior is MEDIUM — needs Phase 1 validation |
| Pitfalls | HIGH | WSL2 kernel module constraints, Chrome/Windows device visibility, audio feedback loop, Node.js GC behavior are all well-documented and HIGH confidence. Gemini session limits and Chrome device enumeration edge cases are MEDIUM |

**Overall confidence:** MEDIUM — well-grounded in established Linux audio/video patterns, with known uncertainty concentrated in two areas: WSL2 environment specifics and current Gemini Live API surface.

### Gaps to Address

- **Gemini Live Node.js server-side support:** Early Gemini Live releases were browser-SDK-only. Verify that server-side Node.js usage is supported and documented before committing to this API in Phase 4 planning. Fallback is STT+LLM+TTS pipeline (significantly higher latency).
- **WSL2 browser environment decision:** Must be made explicitly in Phase 1. There is no architecture that works for both Chrome-on-Windows and Chrome-in-WSL2 without conditional routing. Pick one as primary.
- **Audio isolation from system audio:** The approach of directing Chrome's audio output to a dedicated PulseAudio sink (via `--audio-output-device` flag or environment variable) needs verification against current Chrome/ChromeDriver behavior on WSL2.
- **VAD responsibility:** If Gemini Live provides server-side VAD, the client-side implementation is simpler (send continuously, let API handle silence). If not, client-side VAD is required before Phase 4 connects to the paid API. Verify against current API docs.

---

## Sources

### Primary (HIGH confidence)
- Linux v4l2loopback project documentation and community usage — virtual camera device patterns
- PulseAudio/PipeWire official documentation — null-sink, virtual-source, monitor source patterns
- Node.js official documentation — child_process streams, event-driven patterns
- WSL2 GitHub issues and Microsoft documentation — kernel module constraints, WSLg audio behavior

### Secondary (MEDIUM confidence)
- Training data through August 2025: Gemini Live API (`BidiGenerateContent`) WebSocket protocol, message schema, audio format requirements — verify at https://ai.google.dev/api/multimodal-live before Phase 4
- Training data: `@google/genai` npm package — verify current name and version at https://npmjs.com/package/@google/genai
- Training data: `naudiodon` Node.js 22 compatibility — verify at https://npmjs.com/package/naudiodon
- Training data: Gemini Live session time limits (~15-30 minutes) — verify against current API documentation

### Tertiary (LOW confidence — needs validation)
- Chrome `--audio-output-device` flag behavior on WSL2 — needs hands-on testing in Phase 1
- WSLg PulseAudio socket path and Chrome device enumeration — environment-dependent, needs Phase 1 validation
- OBS Virtual Camera API as Windows-side video bridge for WSL2 — needs evaluation in Phase 1

---
*Research completed: 2026-03-25*
*Ready for roadmap: yes*
