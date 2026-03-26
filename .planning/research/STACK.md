# Technology Stack

**Project:** AI Meet Agent
**Researched:** 2026-03-25
**Research Mode:** Ecosystem — standard stack for virtual audio/video devices with AI conversation pipeline on Linux/WSL2, Node.js/TypeScript

---

> **IMPORTANT RESEARCH NOTE:** All web research tools (WebSearch, WebFetch, Bash) were unavailable during this research session. All findings are drawn from training data (knowledge cutoff August 2025). Confidence levels reflect this limitation — all MEDIUM/LOW items MUST be verified before implementation begins. Items marked HIGH are stable, well-established technologies unlikely to have changed.

---

## Recommended Stack

### AI Conversation API

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Google Gemini Live API (`@google/genai`) | `^1.x` (verify on npmjs.com) | Realtime bidirectional audio streaming — send participant audio, receive AI voice response | The only Google API that supports true streaming bidirectional audio with sub-2s latency suitable for conversation. Cloud STT+TTS pipeline adds 2-4s round-trip latency due to HTTP request/response overhead — not suitable for conversational feel. Gemini Live uses persistent WebSocket with audio in/out. |

**Confidence: MEDIUM** — Gemini Live API launched mid-2024 and was the clear choice for realtime audio as of mid-2025. Verify the npm package name and current version against https://ai.google.dev/api/multimodal-live before coding.

**What NOT to use:**
- `@google-cloud/speech` + `@google-cloud/text-to-speech` pipeline: Two-phase HTTP pipeline. Each leg adds 500ms-1500ms. Total round-trip typically 2-4s. Fails the sub-2s conversational feel requirement.
- OpenAI Realtime API: Works well, but project context specifies Google AI integration and Google Meet ecosystem alignment.
- Deepgram + ElevenLabs: Lower latency voice pipeline, but fragmented (two vendors), no integrated LLM reasoning layer without additional orchestration.

---

### Virtual Video Device (Camera)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `v4l2loopback` (kernel module) | `0.12.x` or `0.13.x` | Creates a `/dev/videoN` device that appears as a real webcam in browsers and apps | The standard Linux solution for virtual cameras. Used by OBS Studio, ManyCam, and every major virtual camera product. Browser (Chromium/Chrome) enumerates it as a real `getUserMedia` camera source. |
| `ffmpeg` (system binary) | `6.x` or `7.x` | Write JPEG/MJPEG frames or raw video into the v4l2loopback device | Mature, reliable tool for piping video data into virtual devices. Simpler than writing raw V4L2 ioctls directly from Node.js. |
| `node-ffmpeg` or `fluent-ffmpeg` | `^2.1.x` | Node.js wrapper to spawn and control ffmpeg processes | Thin process wrapper; no native bindings means no build issues. |

**Confidence: HIGH** — v4l2loopback is the canonical Linux virtual camera kernel module, unchanged in approach for 10+ years.

**WSL2 caveat (CRITICAL):** v4l2loopback requires a Linux kernel module. WSL2 ships a Microsoft-patched kernel that does NOT include `v4l2loopback` out of the box. Options:
1. Compile v4l2loopback against the WSL2 kernel headers and load with `insmod` — works but requires rebuild on kernel updates.
2. Use a custom WSL2 kernel with v4l2loopback pre-compiled — more stable long-term.
3. Accept that WSL2 users need a one-time kernel module setup step, documented in the README.

**Confidence of WSL2 caveat: HIGH** — This is a known, well-documented limitation of WSL2's kernel model.

**What NOT to use:**
- Direct V4L2 ioctl syscalls from Node.js: Overly complex, fragile, and unnecessary when ffmpeg handles the device write reliably.
- OBS VirtualCam plugin: Requires OBS to be running, heavy dependency.

---

### Virtual Audio Device (Microphone + Speaker)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| PipeWire (system daemon) | `1.x` (shipped with Ubuntu 22.04+, Fedora 35+) | Modern audio server replacing PulseAudio; creates virtual audio nodes | PipeWire is the current standard on all major 2024+ Linux distros. Supports both PulseAudio and JACK compatibility layers. Lower latency than PulseAudio. |
| `pw-loopback` / `pactl load-module module-null-sink` | — (system tools) | Create null sink (virtual speaker) and loopback source (virtual mic) | Standard pattern: Create a null sink; its monitor becomes the virtual mic input that browsers see via `getUserMedia`. Capture the null sink's monitor to intercept what the browser sends out (Meet participant audio). |
| `node-audio` or `naudiodon` | `^2.x` | Node.js PortAudio bindings for reading/writing PCM audio streams | PortAudio provides cross-platform low-level PCM access. Needed to read audio from the virtual sink monitor and write AI-generated audio back. |

**Confidence: MEDIUM** — PipeWire as the primary audio server is HIGH confidence (it ships by default on Ubuntu 22.04 LTS and Ubuntu 24.04 LTS). The specific Node.js binding (`naudiodon` vs others) needs verification — this space has some churn.

**WSL2 caveat (CRITICAL):** WSL2 has limited audio hardware support. PulseAudio/PipeWire can run inside WSL2 as a user-space daemon, but the socket path and DBUS environment may need explicit configuration. The Google Chrome/Chromium browser running inside WSL2 (via WSLg) should be able to enumerate PulseAudio virtual devices, but this is a less-tested path. **Recommend:** Test audio device visibility in Chrome on WSL2 early in development — this is the highest-risk integration point.

**What NOT to use:**
- JACK alone: Too low-level, poor ecosystem for this use case, not browser-visible.
- ALSA loopback (`snd-aloop`) without PulseAudio/PipeWire layer: ALSA devices are not typically exposed to browsers; browsers use PulseAudio/PipeWire for `getUserMedia`.
- PulseAudio directly (without PipeWire compatibility): Still works on older systems, but PipeWire is the modern standard. Use PipeWire with its PulseAudio compatibility layer — commands are identical.

---

### Audio Pipeline in Node.js

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `naudiodon` | `^2.x` | PCM audio capture and playback via PortAudio bindings | Native addon with pre-built binaries (node-pre-gyp). Stable, commonly used for real-time audio in Node.js. Provides low-latency stream access. |
| Node.js `stream` (built-in) | Node 22 | Pipe audio data between capture, AI API, and playback | Standard streams keep the pipeline composable and backpressure-aware. |
| `ws` | `^8.x` | WebSocket client for Gemini Live API persistent connection | Gemini Live API is WebSocket-based. The official `@google/genai` SDK wraps this, but knowing the underlying transport helps with debugging. |

**Confidence: MEDIUM** — `naudiodon` is well-established but check for Node.js 22 compatibility. The `ws` library is HIGH confidence as the de-facto WebSocket client.

**Alternative worth knowing:** `node-portaudio` (different package, same PortAudio C library). Evaluate build success on the target system — native addons occasionally have node-gyp issues on WSL2.

---

### Core Framework & TypeScript

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js | `22.x LTS` | Runtime | Current LTS. Native fetch, `--watch` mode, stable ESM. |
| TypeScript | `^5.4` | Type safety across async audio/stream pipeline | Complex async pipeline with multiple typed message formats (Gemini API responses, audio chunks, device events) benefits greatly from TypeScript. |
| `tsx` | `^4.x` | Run TypeScript directly in development | Faster DX than `ts-node`. Uses esbuild internally. |
| `tsup` | `^8.x` | Bundle TypeScript for production | Simple, esbuild-based bundler. Right-sized for a Node.js CLI/service. |

**Confidence: HIGH** — These are stable, widely-used tools.

---

### Google AI SDK

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@google/genai` | `^1.x` (verify) | Official Google AI Node.js SDK, includes Gemini Live API support | Google consolidated their Node.js AI SDKs. This package replaced `@google-cloud/vertexai` and `generativeai` packages for many use cases. Gemini Live API (multimodal live/realtime) is exposed through this package. |

**Confidence: MEDIUM** — Package name and API surface need verification. Google's SDK naming has changed multiple times. Check https://npmjs.com/package/@google/genai for current version and changelog.

**Verify specifically:**
- Whether `@google/genai` exposes the Gemini Live (`BidiGenerateContent`) WebSocket API in Node.js (not just browser).
- Audio input/output format requirements (PCM 16kHz mono LINEAR16 is typical for Google audio APIs, but verify for Live API).
- Whether server-side (non-browser) usage of Gemini Live API is available at all — early releases were browser/web SDK only.

---

### Configuration & CLI

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `dotenv` | `^16.x` | Load API keys from `.env` | Standard approach. Never hardcode API keys. |
| `zod` | `^3.x` | Runtime validation of config/persona JSON | Validate persona config files at startup with helpful error messages. |
| `commander` | `^12.x` | CLI argument parsing | Simple, typed CLI for `--persona`, `--camera-device`, `--audio-sink` flags. |

**Confidence: HIGH** — All stable, widely-used packages.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| AI Audio API | Gemini Live API | Cloud STT + TTS pipeline | 2-4s round-trip latency; fails conversational feel requirement |
| AI Audio API | Gemini Live API | OpenAI Realtime API | Works well technically, but project specifies Google AI; avoid splitting vendors |
| Virtual Mic | PipeWire null-sink + loopback | ALSA snd-aloop | ALSA not visible to browsers via getUserMedia; requires PulseAudio/PipeWire bridge anyway |
| Virtual Camera | v4l2loopback + ffmpeg | GStreamer v4l2sink | GStreamer is heavier but valid. ffmpeg is simpler for the static image use case. |
| Node.js Audio | naudiodon (PortAudio) | `node-soundio` (libsoundio) | naudiodon has broader Linux device support and more community usage for this pattern |
| Node.js Audio | naudiodon (PortAudio) | Web Audio API via headless browser | Enormous complexity — spawning a headless browser just for audio capture defeats the purpose |
| TypeScript Runner | tsx | ts-node | tsx is significantly faster (esbuild vs tsc transform); ts-node has legacy quirks |
| Bundler | tsup | esbuild directly | tsup wraps esbuild with sane defaults; less configuration |

---

## Dependency Installation

```bash
# Core runtime dependencies
npm install @google/genai naudiodon fluent-ffmpeg ws dotenv zod commander

# Development dependencies
npm install -D typescript tsx tsup @types/node @types/fluent-ffmpeg @types/ws

# TypeScript config
npx tsc --init
```

**System dependencies (Linux/WSL2):**
```bash
# Kernel module for virtual camera
sudo apt-get install v4l2loopback-dkms v4l2loopback-utils

# Load the module (creates /dev/video0 or next available)
sudo modprobe v4l2loopback video_nr=10 card_label="AI Meet Agent" exclusive_caps=1

# ffmpeg for video writing
sudo apt-get install ffmpeg

# PipeWire (usually pre-installed on Ubuntu 22.04+)
sudo apt-get install pipewire pipewire-pulse wireplumber

# PortAudio development headers (needed for naudiodon build)
sudo apt-get install libportaudio2 portaudio19-dev
```

---

## WSL2-Specific Setup Notes

WSL2 requires special handling for both virtual devices:

**Camera (v4l2loopback on WSL2):**
```bash
# Install WSL2 kernel headers
sudo apt-get install linux-headers-$(uname -r)
# If headers not found (common in WSL2):
# Must compile against Microsoft's WSL2 kernel source
# See: https://github.com/microsoft/WSL2-Linux-Kernel
```

**Audio (PipeWire/PulseAudio on WSL2):**
- WSLg (Windows Subsystem for Linux GUI, available in Windows 11) includes a PulseAudio socket forwarding mechanism.
- Chrome running via WSLg should enumerate PulseAudio virtual devices.
- If running headless (no WSLg), audio testing must happen on native Linux.

**Risk assessment:** WSL2 audio/video device plumbing is the highest-risk part of this stack. Early spike recommended before committing to architecture.

---

## Versions to Verify Before Coding

The following need version verification against current npm/official docs before implementation:

| Package | Verify At | Why |
|---------|-----------|-----|
| `@google/genai` | https://npmjs.com/package/@google/genai | Package name may have changed; Live API availability in Node.js needs confirmation |
| `naudiodon` | https://npmjs.com/package/naudiodon | Check Node.js 22 compatibility and if pre-built binaries exist |
| `v4l2loopback` | https://github.com/umlaeute/v4l2loopback | Check if DKMS package in apt is current enough |
| Gemini Live audio format | https://ai.google.dev/api/multimodal-live | Confirm PCM format requirements (sample rate, bit depth, channels) |

---

## Sources

- Training data (knowledge cutoff August 2025) — all items require independent verification
- **MEDIUM confidence items require verification** before phase planning commits to them
- Project context: `/home/chris/projects/ai-meet-agent/.planning/PROJECT.md`
- External tools unavailable during this research session (WebSearch, WebFetch, Bash denied)
