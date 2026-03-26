# Domain Pitfalls

**Domain:** AI-powered virtual meeting agent — virtual devices + AI audio pipeline on Linux/WSL2
**Researched:** 2026-03-25
**Confidence:** MEDIUM overall — strong training-data knowledge through Aug 2025; WSL2 kernel specifics and current Gemini API limits flagged as needing verification

---

## Critical Pitfalls

Mistakes that cause rewrites, fundamental blockers, or render the system unusable.

---

### Pitfall 1: v4l2loopback Does Not Work in WSL2 Without a Custom Kernel

**What goes wrong:** v4l2loopback is a kernel module. WSL2 ships with Microsoft's custom kernel that does not include v4l2loopback. Attempting `modprobe v4l2loopback` fails silently or with "module not found." The virtual camera never appears, and Chrome sees no webcam device.

**Why it happens:** WSL2 uses a Hyper-V-based VM with a custom Microsoft kernel. Third-party kernel modules (v4l2loopback, snd-aloop, etc.) are not compiled in. The user must compile a custom kernel with these modules enabled and configure WSL2 to use it via `.wslconfig`.

**Consequences:** Total blocker for virtual camera on WSL2 without workarounds. Standard installation docs for v4l2loopback will appear to succeed (apt install) but the module will not load. Hours lost debugging.

**Prevention:**
- In Phase 1 (environment setup), explicitly test `modprobe v4l2loopback` and document the custom kernel build process.
- Document the `.wslconfig` `kernel=` path approach as the standard WSL2 setup step.
- Alternatively, investigate `usbip` (USB/IP forwarding) or Windows-side virtual devices visible to WSL2 via passthrough as a fallback path.
- Consider making standard Linux (non-WSL2) the primary dev target and treating WSL2 as an explicit secondary target with a separate setup guide.

**Detection:** Run `lsmod | grep v4l2loopback` and `ls /dev/video*` immediately after module load attempt. Failure here = custom kernel required.

**Phase:** Address in Phase 1 (Environment & Virtual Device Setup). Do not assume this works.

---

### Pitfall 2: Browser (Chrome) Does Not See Virtual V4L2 Devices Without Specific Flags or Permissions

**What goes wrong:** Even with v4l2loopback loaded and `/dev/video0` present, Chrome may refuse to enumerate the device in `navigator.mediaDevices.enumerateDevices()`, or list it but reject `getUserMedia` calls for it. This also affects Electron-based apps.

**Why it happens:** Chrome's sandboxing restricts `/dev/video*` access. In WSL2, the browser runs in the Windows host — it uses Windows camera devices, not Linux `/dev/video*` — which means the virtual Linux device is completely invisible to Chrome on Windows unless there is a Windows-side virtual camera driver presenting it.

**Consequences:** In WSL2, the architecture may need to be inverted: run Chrome inside WSL2 (with X11/Wayland forwarding) OR use a Windows virtual camera tool (OBS Virtual Camera, VirtualCam, etc.) that Chrome on Windows can see. This is a fundamental architecture question.

**Prevention:**
- Early in Phase 1, test which browser environment is used: browser inside WSL2 (via X11/VcXsrv/WSLg) vs. browser on Windows host.
- If using Windows browser: Linux virtual devices are invisible. Must use a Windows-side virtual camera (OBS Virtual Camera is the standard approach) that mirrors what the Linux pipeline feeds.
- If using WSL2 browser with WSLg: Linux virtual devices may work, but WSLg GPU/audio passthrough has its own quirks.
- Document the target browser environment explicitly before building the video pipeline.

**Detection:** Open Chrome, navigate to `chrome://settings/content/camera` — does `/dev/video0` appear? If not and you're on WSL2, this is the issue.

**Phase:** Must be resolved in Phase 1 before any audio work begins.

---

### Pitfall 3: Audio Virtual Device Architecture Mismatch Between WSL2 and Native Linux

**What goes wrong:** PulseAudio `module-null-sink` and `module-loopback` work well on native Linux but behave inconsistently in WSL2. WSL2's audio pipeline routes through the Windows audio stack (via RDP audio or PulseAudio-over-TCP to a Windows PulseAudio server). The virtual sink you create may not be visible in Chrome's `enumerateDevices()`.

**Why it happens:** WSL2 does not natively expose PulseAudio sinks to the Windows audio system. Chrome on Windows (the primary browser target) uses Windows audio devices (WASAPI), not PulseAudio sinks. The virtual PulseAudio sink exists only within the Linux subsystem and is inaccessible to Windows applications.

**Consequences:** Audio capture from Meet (Chrome on Windows) and audio injection into Meet both fail silently or require a complex bridge architecture involving Windows-side virtual audio cables (VB-Cable, Virtual Audio Cable) plus PulseAudio TCP bridging.

**Prevention:**
- In WSL2: use Windows virtual audio tools (VB-Cable is the standard) on the Windows side. Node.js pipeline in Linux communicates with these via network audio (TCP) or via Windows audio API bridges.
- On native Linux: PulseAudio null-sink + loopback approach works well.
- Design the audio routing layer to be pluggable — different backends for WSL2 vs. native Linux.
- Phase 1 must validate the full audio path: "Can Chrome hear a tone we generate, and can we capture Chrome's audio output?"

**Detection:** Create a PulseAudio null sink, play audio to it from Node.js, attempt `getUserMedia({ audio: true })` in Chrome targeting that device. If Chrome cannot see/select it, the architecture is broken.

**Phase:** Phase 1 (audio routing validation). The device abstraction layer design must account for this in Phase 2.

---

### Pitfall 4: Audio Feedback Loop — AI Hears Its Own Voice

**What goes wrong:** The system captures all audio output from Chrome (including Meet's audio playback). When the AI generates a response and plays it through the virtual microphone into Meet, that audio comes back through Meet's echo to other participants and may also be re-captured by the local capture loop. This creates a feedback loop: AI hears its own voice, generates a response to itself, loops indefinitely.

**Why it happens:** The virtual mic input and the Meet audio output share the same or overlapping audio routes. Without echo cancellation gating, the capture loop picks up the AI-generated audio.

**Consequences:** Runaway API calls, nonsensical responses, audio artifacts, wasted tokens/quota.

**Prevention:**
- Implement a "speaking" gate: while AI audio is being played out through the virtual mic, suppress or mute the input capture pipeline.
- Use separate PulseAudio sinks for output (what participants hear) and capture (what feeds the AI). Never route the AI's output back through the capture path.
- Consider acoustic echo cancellation (AEC) — PulseAudio has `module-echo-cancel` using speex or webrtc algorithms.
- In Phase 3 (bidirectional audio loop), make this a first-class design concern before wiring up end-to-end.

**Detection:** In a loopback test, play a short audio clip through the virtual mic while capture is active. If your capture stream contains that audio, you have a feedback path.

**Phase:** Phase 3 (bidirectional loop). Design the mute-gate before first end-to-end test.

---

### Pitfall 5: Latency Accumulation Across the Pipeline Exceeds Conversational Threshold

**What goes wrong:** Each stage of the pipeline adds latency: audio capture buffering (50-200ms), WebSocket transmission to Google API (50-150ms RTT), AI processing/TTFB (300-800ms), audio synthesis (100-500ms), playback buffering (50-200ms). Accumulated, this easily reaches 2-4 seconds — which feels robotic, not conversational.

**Why it happens:** Developers add buffering at each stage without measuring end-to-end. Node.js audio libraries default to large buffer sizes (safe but slow). The Google Gemini Live API streams audio back, but TTFB (time-to-first-byte of response) is variable under load.

**Consequences:** The sub-2s target from PROJECT.md becomes impossible if each stage is not actively tuned. The AI twin feels like a lag-bot, not a conversational presence.

**Prevention:**
- Measure end-to-end latency from speech start to AI response audio start in Phase 3. Add instrumentation before optimizing.
- Use streaming PCM (not WAV files with headers) throughout the pipeline. Never buffer full utterances if streaming is available.
- Use the Gemini Live API's native streaming mode (not request-response). Bidirectional WebSocket keeps connection warm.
- Set audio chunk size aggressively small (160-320 samples at 16kHz = 10-20ms chunks) and measure the impact.
- Pre-warm the WebSocket connection — don't open it on first utterance.
- Accept that a small amount of silence/pause detection buffering is necessary (300-500ms) to know an utterance is complete, but make this configurable.

**Detection:** Add `Date.now()` timestamps at: (1) first audio chunk captured, (2) WebSocket send, (3) first response chunk received, (4) first audio played out. Log per-conversation. Budget: capture→send <50ms, send→first-chunk <800ms, chunk→playback <100ms.

**Phase:** Phase 3 (end-to-end loop) with optimization pass in Phase 4.

---

## Moderate Pitfalls

Issues that cause significant rework but are recoverable.

---

### Pitfall 6: Google Gemini Live API Session Limits and Reconnection Not Handled

**What goes wrong:** The Gemini Live API enforces session time limits (sessions expire after a fixed duration, likely 15-30 minutes based on available documentation). If the Node.js client does not handle `SESSION_EXPIRED` or WebSocket close events gracefully, the AI twin goes silent mid-call with no recovery.

**Why it happens:** Developers build the happy path (open connection, stream audio, get responses) without implementing reconnection logic. Long calls (1h+ stand-ups or interviews) will always hit session limits.

**Prevention:**
- Implement WebSocket reconnection with exponential backoff from day one.
- On session expiry, gracefully reinitialize: re-send system prompt/persona context, resume audio streaming.
- Maintain a "session age" counter — proactively reconnect before the limit rather than reacting to failures.
- Test with artificially short session timeouts during development.

**Detection:** Observe WebSocket close codes. Code `1000` (normal) vs. `1011` (server error) vs. API-specific close codes from Gemini. Monitor for unexpected close events during active sessions.

**Phase:** Phase 3 (API integration). Reconnection must be part of initial implementation, not a later fix.

---

### Pitfall 7: Chrome Device Enumeration Returns Stale or Duplicate Device Names

**What goes wrong:** When v4l2loopback or PulseAudio virtual devices are created, they appear in `enumerateDevices()` with generic labels like "Video input 1" or blank labels. When devices are re-created (after a system restart or module reload), Chrome may cache the old device ID and the new device gets a different ID. Saved device selections break.

**Why it happens:** Browser device IDs are based on hardware identifiers that change when virtual devices are recreated. Chrome caches device enumerations across sessions.

**Prevention:**
- Give virtual devices persistent, recognizable names. For v4l2loopback: `modprobe v4l2loopback card_label="AI Meet Agent Camera"`. For PulseAudio: use consistent sink names in module load commands.
- Document that the user must re-select devices after system restart in v1. Auto-persistence of device selection is a Phase 4+ enhancement.
- Test device naming behavior specifically: create device, check name in Chrome, reload device, check name again.

**Detection:** Load device in Chrome, note device label. Unload and reload kernel module or PulseAudio module. Check if Chrome still shows the device with the same label and ID.

**Phase:** Phase 1 (device setup). Device naming strategy established at setup, not retrofitted.

---

### Pitfall 8: Node.js Cannot Reliably Do Hard Real-Time Audio Processing

**What goes wrong:** Node.js's event loop, garbage collector, and V8 JIT pauses introduce non-deterministic delays. For audio at 16kHz with 10ms chunks, a 20-50ms GC pause causes buffer underruns, audible glitches, and dropped audio frames.

**Why it happens:** Node.js is single-threaded and not designed for hard real-time workloads. Heavy object allocation in audio processing loops triggers GC. Long-running async operations can starve the event loop.

**Consequences:** Audible clicks, pops, or gaps in audio output. Dropped input frames causing the AI to miss words. Difficult to reproduce and diagnose.

**Prevention:**
- Offload audio I/O to a native addon (node-addon-api with ALSA/PulseAudio bindings) or use a subprocess (e.g., `ffmpeg` piped via stdio) for the heavy I/O. Keep the Node.js layer as a coordinator, not an audio processor.
- Avoid object allocation in the hot audio path. Pre-allocate `Buffer` instances, use typed arrays (Float32Array, Int16Array), recycle buffers.
- Use `--expose-gc` + manual GC scheduling in development to identify GC pressure.
- `node --max-old-space-size` tuning is not a fix — reduce allocation instead.
- Consider `worker_threads` for audio pipeline isolation from the main event loop.

**Detection:** Use Node.js `--prof` and `node --perf-basic-prof` to identify GC pauses. Listen for audio artifacts — any clicking or popping in a 30-minute test session is a signal.

**Phase:** Phase 2 (audio pipeline architecture). Design must account for this upfront.

---

### Pitfall 9: Meet's Audio Output Is Not Directly Accessible Via ALSA/PulseAudio Capture

**What goes wrong:** Google Meet's audio plays through the browser's audio output. Capturing this audio in Node.js requires routing it to a capture-able PulseAudio source. Simply recording the default PulseAudio sink-monitor works on native Linux but has complications: it captures ALL system audio (notifications, music, etc.) not just Meet audio.

**Why it happens:** Browsers do not expose their audio output as a named PulseAudio source. The only way to capture it is via monitor sources of the output sink, or by creating a dedicated audio routing topology.

**Prevention:**
- Use Chrome's `--audio-output-device` flag to direct Meet's audio to a specific PulseAudio sink, then monitor that sink. This isolates Meet audio from system audio.
- Launch Chrome with `PULSE_SINK=meet_output_sink` environment variable or use PulseAudio per-app routing rules.
- Test audio isolation early: verify only Meet audio (not system sounds) reaches the AI pipeline.
- On WSL2: this becomes a Windows-side routing problem — use VB-Cable or similar to route Chrome's audio output to a capturable input.

**Detection:** Play a YouTube video in Firefox while Meet is running. If the AI pipeline receives both audio streams, isolation is broken.

**Phase:** Phase 2 (audio routing). Must be solved before Phase 3 end-to-end integration.

---

### Pitfall 10: Silence Detection / VAD (Voice Activity Detection) Not Implemented

**What goes wrong:** The system continuously streams all audio — silence, background noise, keyboard clicks — to the Gemini API. This burns API quota, keeps the API processing noise, and causes the AI to respond to non-speech. Alternatively, without VAD, the system doesn't know when a speaker has finished, so it either interrupts mid-sentence or waits too long to respond.

**Why it happens:** The simplest implementation streams everything. VAD is treated as an optimization to add later.

**Consequences:** 10x+ higher API costs from streaming silence. Inappropriate interruptions. The system responds to coughs or background noise.

**Prevention:**
- Implement basic energy-threshold VAD before connecting to the API in Phase 3. Simple RMS power calculation is sufficient for v1.
- Gemini Live API may have server-side VAD — verify this and use it if available, but still gate transmission for cost control.
- Implement configurable silence threshold and end-of-utterance timeout (e.g., 500ms silence after speech = utterance complete).

**Detection:** Run the pipeline with no one speaking. Monitor API bytes sent per second and cost. Streaming silence to a paid API for 60 minutes during a meeting is a measurable cost problem.

**Phase:** Phase 3 (API integration). VAD must be part of the initial send loop, not added later.

---

## Minor Pitfalls

Issues that cause friction or require small workarounds.

---

### Pitfall 11: Virtual Camera Frame Rate Mismatch Causes Browser to Drop or Stutter

**What goes wrong:** v4l2loopback defaults to accepting whatever frame rate is pushed to it. If Node.js pushes static frames irregularly (e.g., only when updated), Chrome may show a frozen or intermittently stuttering video feed.

**Prevention:** Emit frames at a consistent rate (30fps) even if the content is static. Use a timer-driven loop to push the same buffer repeatedly. Set `max_buffers=2` on v4l2loopback to minimize latency.

**Phase:** Phase 1 (virtual camera setup).

---

### Pitfall 12: snd-aloop Module Also Not Available in Standard WSL2 Kernel

**What goes wrong:** `snd-aloop` (ALSA loopback) is another common virtual audio approach. Like v4l2loopback, it requires custom kernel compilation in WSL2. Developers who plan to use snd-aloop for audio routing discover this late.

**Prevention:** Use PulseAudio null-sink approach (userspace, no kernel module) instead of snd-aloop for WSL2 audio routing. PulseAudio modules are loaded without kernel module requirements.

**Phase:** Phase 1 (environment setup decision).

---

### Pitfall 13: Gemini API Audio Format Requirements Not Validated Early

**What goes wrong:** The Gemini Live API expects a specific audio format (typically 16kHz, 16-bit, mono PCM). Browser-captured audio may come out as 48kHz stereo float32. Format mismatch causes the API to return errors or produce garbled responses.

**Prevention:** Add explicit format conversion (resample to 16kHz, mix to mono, convert to int16) as the first step in the send pipeline. Validate this before the first API call. Use Node.js `pcm-convert` or an ffmpeg subprocess for resampling.

**Phase:** Phase 3 (API integration). Test with a known audio clip before any live audio.

---

### Pitfall 14: TypeScript Typing Gaps in Audio Buffer Handling Lead to Runtime Errors

**What goes wrong:** Node.js audio APIs deal in `Buffer`, `Int16Array`, `Float32Array`, and sometimes raw numbers. TypeScript types for audio libraries are often incomplete or wrong. Buffer slicing and array view conversions are easy to get wrong, producing corrupted audio that sounds like noise rather than throwing errors.

**Prevention:** Write and test explicit typed conversion utilities early (e.g., `int16ArrayToFloat32`, `float32ToInt16`). Add unit tests for these with known audio values. Do not trust implicit Buffer/TypedArray conversions.

**Phase:** Phase 2 (audio pipeline). Test conversions in isolation before integration.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Environment setup (WSL2) | v4l2loopback kernel module unavailable | Test `modprobe` immediately; document custom kernel path |
| Virtual camera browser visibility | Chrome on Windows cannot see Linux `/dev/video*` | Determine browser location (WSL2 vs. Windows) before designing video pipeline |
| Audio routing architecture | PulseAudio sinks invisible to Windows browser | Decide on WSL2 vs native Linux audio architecture in Phase 1 |
| Audio capture from Meet | Capturing all system audio, not just Meet | Use Chrome audio output routing to dedicated sink |
| Bidirectional audio loop | AI hears its own voice, feedback loop | Implement speak-gate before first end-to-end test |
| API integration | Session expiry mid-call, no recovery | Build reconnection logic at initial integration, not post-MVP |
| API integration | Streaming silence burns quota | Implement VAD before connecting to paid API |
| Audio processing in Node.js | GC pauses cause audio glitches | Use native addons or subprocess for I/O; avoid hot-path allocation |
| Latency optimization | Pipeline accumulates >2s latency | Instrument each stage early; stream everywhere |
| Device naming | Chrome sees stale/duplicate device IDs | Use persistent device names at module load time |

---

## Confidence Assessment

| Pitfall Area | Confidence | Notes |
|--------------|------------|-------|
| v4l2loopback in WSL2 | HIGH | Well-documented community issue; custom kernel requirement is established fact |
| Chrome/Windows seeing Linux devices | HIGH | Fundamental WSL2 architecture constraint |
| PulseAudio/WSL2 Windows audio bridge | HIGH | WSL2 audio stack behavior is well-documented |
| Audio feedback loop | HIGH | Classic virtual audio routing problem, not WSL2-specific |
| Latency accumulation | HIGH | Pipeline latency math is deterministic; specific Gemini TTFB numbers are MEDIUM |
| Gemini session limits | MEDIUM | Session limit existence is known; exact duration needs verification against current Gemini Live API docs |
| Node.js real-time audio | HIGH | Fundamental Node.js GC behavior is well-documented |
| Chrome device enumeration quirks | MEDIUM | Behavior documented but specifics can vary across Chrome versions |
| Gemini audio format requirements | MEDIUM | 16kHz mono PCM is standard for Google Speech APIs; verify against current Gemini Live API spec |

---

## Sources

- WSL2 kernel module constraints: training data + community knowledge (WSL2 GitHub issues, custom kernel compilation guides). HIGH confidence — fundamental WSL2 architecture.
- v4l2loopback behavior: project README, community usage patterns. HIGH confidence.
- PulseAudio WSL2 audio routing: PulseAudio documentation + WSL2 audio forwarding documentation. HIGH confidence.
- Chrome device enumeration behavior: Web APIs spec + community reports. MEDIUM confidence — verify against current Chrome version.
- Gemini Live API session limits and audio format: training data through Aug 2025. MEDIUM confidence — verify against current API documentation at https://ai.google.dev/api/multimodal-live before implementation.
- Node.js real-time audio constraints: V8/Node.js documentation, community experience. HIGH confidence.
- Audio feedback loop prevention: Signal processing fundamentals + PulseAudio echo cancel module documentation. HIGH confidence.
