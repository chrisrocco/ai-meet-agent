# Architecture Patterns

**Domain:** AI virtual meeting agent (Linux virtual devices + realtime AI audio)
**Researched:** 2026-03-25
**Confidence:** MEDIUM — based on training knowledge of Linux virtual device systems, PulseAudio/PipeWire internals, and Gemini Live API patterns. External verification blocked during research session; flag critical claims for validation.

---

## Recommended Architecture

The system is a pipeline of five distinct layers. Data flows left-to-right through the pipeline, with a feedback loop back into Meet via the virtual microphone.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         GOOGLE MEET (Browser)                           │
│  [Other participants' audio out] ────────────► [Virtual Mic input]      │
└──────────────────┬──────────────────────────────────────▲───────────────┘
                   │ system audio out                     │ virtual mic device
                   ▼                                      │
┌──────────────────────────────┐          ┌───────────────────────────────┐
│   LAYER 1: VIRTUAL DEVICES   │          │  LAYER 1: VIRTUAL DEVICES     │
│   Audio Capture Sink         │          │  Virtual Source (mic)         │
│   (PulseAudio/PipeWire sink) │          │  (PulseAudio/PipeWire source) │
│   v4l2loopback (video)       │          │                               │
└──────────────────┬───────────┘          └───────────────▲───────────────┘
                   │ PCM audio frames                     │ PCM audio frames
                   ▼                                      │
┌──────────────────────────────┐          ┌───────────────────────────────┐
│   LAYER 2: AUDIO CAPTURE     │          │  LAYER 4: AUDIO OUTPUT        │
│   Read audio frames from     │          │  Write AI response audio to   │
│   monitor/loopback device    │          │  virtual source device        │
│   (Node.js stream)           │          │  (Node.js stream)             │
└──────────────────┬───────────┘          └───────────────▲───────────────┘
                   │ raw PCM / encoded audio              │ raw PCM audio
                   ▼                                      │
┌─────────────────────────────────────────────────────────────────────────┐
│                    LAYER 3: AI API INTEGRATION                          │
│   WebSocket connection to Gemini Live API                               │
│   Send: audio chunks (16kHz PCM, base64-encoded)                        │
│   Receive: audio response chunks (24kHz PCM, base64-encoded)            │
│   Maintain: session state, turn management, system prompt / persona     │
└─────────────────────────────────────────────────────────────────────────┘
                   │ (static image feed, separate path)
                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    LAYER 5: VIDEO FEED                                  │
│   Read static image file → encode as YUYV/MJPEG frames                 │
│   Write frame loop to /dev/videoN (v4l2loopback)                        │
│   ffmpeg loop process (subprocess, independent of audio pipeline)       │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                    LAYER 6: ORCHESTRATION / CONTROL                     │
│   CLI entry point, lifecycle management (start/stop/status)             │
│   Device setup/teardown, persona config loading, error recovery         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Component Boundaries

| Component | Responsibility | Communicates With | Technology |
|-----------|---------------|-------------------|------------|
| Virtual Audio Sink | Exposes a null-sink that Meet's browser audio plays into; its monitor is readable as a capture source | OS audio subsystem | PulseAudio `module-null-sink` or PipeWire equivalent |
| Virtual Mic Source | Exposes a virtual microphone source that the browser sees as a real mic | OS audio subsystem | PulseAudio `module-virtual-source` or PipeWire loopback |
| Virtual Camera Device | Exposes `/dev/videoN` as a V4L2 device readable by the browser | Kernel (v4l2loopback module) | `v4l2loopback` kernel module |
| Audio Capture Module | Reads PCM frames from the monitor of the virtual sink; buffers into chunks for AI API | Virtual Audio Sink, AI Client | Node.js `child_process` + `parec` or `pacat`, or PipeWire pw-record |
| AI Client (Gemini Live) | Manages WebSocket session to Gemini Live API; sends audio in, receives audio out; manages turns and session | Audio Capture Module, Audio Output Module, Persona Config | `@google/generative-ai` SDK or raw WebSocket |
| Audio Output Module | Receives PCM chunks from AI Client; writes to virtual mic source device | AI Client, Virtual Mic Source | Node.js stream → `pacat` / `pw-play` subprocess |
| Video Feed Module | Reads static image file; encodes and loops frames into v4l2loopback device | Virtual Camera Device | `ffmpeg` subprocess (`-re -loop 1 -i img.jpg -f v4l2 /dev/videoN`) |
| Persona Config | Holds system prompt text, user background, meeting context; loaded at startup | AI Client | JSON/YAML config file |
| Orchestrator / CLI | Entry point; coordinates startup ordering, device setup, teardown, error recovery | All modules | Node.js main process, `commander` or plain `process.argv` |

---

## Data Flow

### Primary Audio Loop (latency-critical path)

```
[Meet participant speaks]
       │
       ▼
Browser audio output → PulseAudio/PipeWire default sink
       │
       ▼  (loopback / monitor tap)
Virtual Sink Monitor (/dev/null-sink.monitor or PipeWire monitor port)
       │
       ▼  (parec / pw-record subprocess, streaming stdout)
Audio Capture Module (Node.js readable stream)
       │  16kHz, 16-bit PCM, mono — chunk every ~100ms
       ▼
Gemini Live API (WebSocket, send audio_chunk messages)
       │  async response stream
       ▼
AI Client receives audio response chunks (24kHz PCM, base64)
       │
       ▼
Audio Output Module (Node.js writable stream → pacat / pw-play subprocess)
       │
       ▼
Virtual Mic Source → browser sees this as microphone input
       │
       ▼
[Meet transmits AI voice to other participants]
```

### Video Feed Path (non-latency-critical, runs independently)

```
[static image file on disk]
       │
       ▼
ffmpeg subprocess (-loop 1 -re -f v4l2 output)
       │
       ▼
/dev/videoN (v4l2loopback)
       │
       ▼
Browser selects /dev/videoN as webcam → displayed to other participants
```

### Control Flow (startup sequence)

```
CLI invoked with --persona config.json
       │
       ▼
Orchestrator: load persona config
       │
       ▼
Orchestrator: setup virtual devices
  ├── load v4l2loopback kernel module (modprobe)
  └── create PulseAudio/PipeWire null-sink + virtual-source
       │
       ▼
Orchestrator: start video feed subprocess (ffmpeg)
       │
       ▼
Orchestrator: establish Gemini Live WebSocket session (with system prompt)
       │
       ▼
Orchestrator: start audio capture subprocess, pipe to AI Client
       │
       ▼
[System running — user joins Meet and selects virtual devices]
       │
       ▼
[Audio loop active until CLI shutdown signal]
       │
       ▼
Orchestrator: teardown (stop subprocesses, remove PulseAudio modules, optionally unload kernel module)
```

---

## Patterns to Follow

### Pattern 1: Subprocess Streams for Device I/O

**What:** Use `pacat`, `parec`, or `pw-record`/`pw-play` as child processes with stdio piped into Node.js streams rather than attempting to bind native audio device libraries directly.

**When:** Always — Node.js lacks mature native PulseAudio/PipeWire bindings. The subprocess approach is reliable and well-understood.

**Example:**
```typescript
import { spawn } from 'child_process';

// Capture from virtual sink monitor
const capture = spawn('parec', [
  '--device=virtual-sink.monitor',
  '--rate=16000',
  '--channels=1',
  '--format=s16le',
]);
capture.stdout.on('data', (chunk: Buffer) => {
  aiClient.sendAudio(chunk);
});

// Write AI response to virtual mic
const playback = spawn('pacat', [
  '--device=virtual-mic-source',
  '--rate=24000',
  '--channels=1',
  '--format=s16le',
  '--playback',
]);
aiClient.on('audioChunk', (chunk: Buffer) => {
  playback.stdin.write(chunk);
});
```

**Confidence:** HIGH — this pattern is the standard approach for Node.js audio I/O on Linux.

---

### Pattern 2: Gemini Live API via WebSocket with Session Management

**What:** Gemini Live API uses a persistent WebSocket connection (not HTTP request/response). The session is initialized with a setup message containing the system prompt and generation config. Audio is streamed in chunks. Responses stream back asynchronously.

**When:** For all realtime audio interaction with the AI.

**Key constraints (MEDIUM confidence — verify against current docs):**
- Input audio: 16kHz, 16-bit PCM (LINEAR16), mono, base64-encoded in JSON
- Output audio: 24kHz PCM, base64-encoded in JSON
- Session lifetime: limited (verify current limit, likely minutes) — need reconnection logic
- Turn management: API signals end-of-turn; don't send more audio until turn is complete OR use continuous streaming mode if available

**Example (pseudocode):**
```typescript
const ws = new WebSocket('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=API_KEY');

ws.on('open', () => {
  // Setup message first
  ws.send(JSON.stringify({
    setup: {
      model: 'models/gemini-2.0-flash-live-001',
      generationConfig: { responseModalities: ['AUDIO'] },
      systemInstruction: { parts: [{ text: personaPrompt }] },
    }
  }));
});

// Send audio chunks
function sendAudio(pcmChunk: Buffer) {
  ws.send(JSON.stringify({
    realtimeInput: {
      mediaChunks: [{
        mimeType: 'audio/pcm;rate=16000',
        data: pcmChunk.toString('base64'),
      }]
    }
  }));
}

// Receive audio response
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.serverContent?.modelTurn?.parts) {
    for (const part of msg.serverContent.modelTurn.parts) {
      if (part.inlineData?.mimeType?.startsWith('audio/pcm')) {
        const audio = Buffer.from(part.inlineData.data, 'base64');
        audioOutput.write(audio);
      }
    }
  }
});
```

**Confidence:** MEDIUM — API shape based on training knowledge of Gemini Live as of mid-2025. Verify exact message schema against current official docs before implementation.

---

### Pattern 3: v4l2loopback + ffmpeg for Virtual Camera

**What:** Load the `v4l2loopback` kernel module to create a virtual V4L2 device, then use ffmpeg to loop a static image into it.

**When:** For video feed. Simple and reliable for static placeholder.

**Example:**
```bash
# Load module (one-time setup, requires sudo or pre-configured)
modprobe v4l2loopback devices=1 video_nr=10 card_label="AI Agent" exclusive_caps=1

# Feed static image (run as subprocess from Node.js)
ffmpeg -re -loop 1 -i /path/to/placeholder.jpg \
  -vf "scale=1280:720" \
  -f v4l2 /dev/video10
```

**Confidence:** HIGH — this is the canonical v4l2loopback usage pattern, well-documented and widely used.

---

### Pattern 4: Isolated Module Lifecycle with Graceful Teardown

**What:** Each module (video feed subprocess, audio capture subprocess, WebSocket session, PulseAudio modules) is tracked by the orchestrator with explicit start/stop methods. Teardown runs in reverse startup order.

**When:** Always — critical for avoiding orphaned processes and leftover PulseAudio modules across runs.

**Example:**
```typescript
class Orchestrator {
  private modules: Module[] = [];

  async start() {
    // Ordered startup
    await this.deviceSetup.start();   // kernel module + PA modules
    await this.videoFeed.start();     // ffmpeg subprocess
    await this.aiClient.start();      // WebSocket session
    await this.audioCapture.start();  // parec subprocess
    await this.audioOutput.start();   // pacat subprocess
  }

  async stop() {
    // Reverse order teardown
    await this.audioOutput.stop();
    await this.audioCapture.stop();
    await this.aiClient.stop();
    await this.videoFeed.stop();
    await this.deviceSetup.teardown(); // remove PA modules
  }
}

process.on('SIGINT', () => orchestrator.stop().then(() => process.exit(0)));
process.on('SIGTERM', () => orchestrator.stop().then(() => process.exit(0)));
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Monolithic Audio Loop

**What:** Putting audio capture, AI communication, and audio output all in a single async function or class.

**Why bad:** The three stages have different timing characteristics. Capture runs at device clock rate. AI response arrives asynchronously with variable latency. Output must pace to device clock rate. Coupling them causes buffer overflows, dropped audio, or blocking.

**Instead:** Use Node.js streams throughout. `capture.stdout` (readable) → transform stream (base64/format) → AI WebSocket send. AI WebSocket receive → transform stream → `playback.stdin` (writable). Each stage is naturally backpressured.

---

### Anti-Pattern 2: Loading PulseAudio Modules as Root

**What:** Running the entire agent process as root to use `modprobe` and `pactl`.

**Why bad:** The browser running Google Meet also needs to access PulseAudio — running PA commands as root from a separate process interferes with the user's PulseAudio session.

**Instead:** `modprobe` requires root (or a pre-configured udev rule / `/etc/modules`). PulseAudio module loading (`pactl load-module`) must run as the same user as the browser. Use `sudo` only for the kernel module step, keep PA operations as the current user.

---

### Anti-Pattern 3: Sending Raw Unchunked Audio to Gemini

**What:** Piping the entire capture stream directly to the API without chunking.

**Why bad:** The Gemini Live API expects discrete chunks. A continuous stream without framing causes protocol errors or silent drops. Excessively large chunks increase latency.

**Instead:** Buffer PCM data into fixed-size chunks (e.g., 100ms = 1600 samples × 2 bytes = 3200 bytes at 16kHz mono 16-bit) before encoding and sending.

---

### Anti-Pattern 4: Blocking on WebSocket Response Before Sending More Audio

**What:** Waiting for the AI to finish responding before capturing/sending more audio.

**Why bad:** Creates a walkie-talkie feel. Gemini Live supports continuous streaming; capture and send should continue (or at minimum, not block the entire pipeline) even while a response is being received.

**Instead:** Decouple capture and response handling. Use event-driven patterns. The AI client emits `audioChunk` events; audio capture emits `data` events. Neither waits for the other synchronously.

---

## Scalability Considerations

This is a single-call, single-user desktop tool. Scalability in the traditional sense is not relevant. However, relevant operational considerations:

| Concern | Single Call (Target) | Notes |
|---------|---------------------|-------|
| Audio latency | < 2s round-trip | Dominated by Gemini API response time; minimize buffer sizes |
| Session reconnection | Graceful, < 5s | Gemini Live sessions have time limits; implement auto-reconnect |
| Resource cleanup | Complete on exit | Orphaned PA modules persist across reboots without cleanup |
| WSL2 audio | Separate concern | WSL2 requires PulseAudio bridge or PipeWire config — document clearly |

---

## Build Order Implications

Dependencies between components determine the implementation sequence:

```
Phase 1: Virtual Device Setup (no dependencies)
  └── v4l2loopback kernel module setup
  └── PulseAudio/PipeWire null-sink + virtual-source setup
  └── Verify: devices visible in browser

Phase 2: Video Feed (depends on Phase 1 — needs /dev/videoN)
  └── ffmpeg subprocess feeding static image to v4l2loopback
  └── Verify: virtual webcam shows placeholder image in Meet

Phase 3: Audio Capture (depends on Phase 1 — needs null-sink monitor)
  └── parec/pw-record subprocess → Node.js stream
  └── Verify: PCM data flows when audio plays in browser

Phase 4: AI API Integration (depends on Phase 3 — needs audio input)
  └── Gemini Live WebSocket session
  └── Send Phase 3 audio → receive AI audio responses
  └── Verify: AI responds to captured speech (log responses, no output yet)

Phase 5: Audio Output (depends on Phase 1 + Phase 4)
  └── pacat/pw-play subprocess writing AI audio to virtual mic
  └── Verify: virtual mic carries AI speech back into Meet

Phase 6: End-to-End + Persona Config (depends on all prior phases)
  └── Persona system prompt loaded from config file
  └── Full pipeline: Meet audio → AI → Meet mic
  └── Verify: complete bidirectional conversation works
```

**Key dependency constraint:** Phase 3 (audio capture) must be validated independently before Phase 4 (AI integration). Debugging a combined "capture + AI" phase is significantly harder than debugging each in isolation.

---

## WSL2-Specific Considerations

WSL2 does not have a kernel with native PulseAudio support by default. Audio on WSL2 typically routes through one of:

1. **PulseAudio TCP server on Windows** — WSL2 processes connect to a PA server running on the Windows host. Common setup, requires configuring `PULSE_SERVER` env var.
2. **PipeWire in WSL2** — Newer WSL2 kernels (5.15+, which this project uses) may support PipeWire with the WSLg audio integration.
3. **WSLg (Windows Subsystem for Linux GUI)** — Microsoft's WSLg includes audio support via PulseAudio socket at `/tmp/PulseServer`. Check `$PULSE_SERVER` or `/tmp/.pulse-*` in WSL2 environment.

**Recommendation:** Test on WSL2 early. The virtual device setup phase (Phase 1) will surface WSL2-specific audio issues before the full pipeline is built.

**Confidence:** MEDIUM — WSL2 audio landscape changes frequently. Verify current WSLg audio behavior.

---

## Sources

- Training knowledge: Linux PulseAudio/PipeWire virtual device patterns (HIGH confidence for well-established patterns)
- Training knowledge: v4l2loopback module usage (HIGH confidence — API stable for years)
- Training knowledge: Gemini Live API WebSocket protocol (MEDIUM confidence — verify message schema against current docs at https://ai.google.dev/api/multimodal-live)
- Training knowledge: Node.js child_process streaming patterns (HIGH confidence)
- Training knowledge: WSL2 audio routing (MEDIUM confidence — verify current WSLg behavior)

**Note:** WebSearch and WebFetch tools were unavailable during this research session. All findings are from training data (knowledge cutoff ~August 2025). The Gemini Live API message schema in particular should be verified against current official documentation before implementation.
