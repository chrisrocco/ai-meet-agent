# Feature Landscape

**Domain:** AI meeting agent / digital twin (Google Meet, virtual audio/video devices)
**Researched:** 2026-03-25
**Confidence note:** External web search was unavailable during this session. Findings are based on training data through August 2025 covering: Recall.ai, Otter.ai, Krisp, Fireflies.ai, Daily.co, and related virtual device / AI audio ecosystems. Confidence levels reflect this limitation.

---

## Table Stakes

Features users expect from any AI meeting agent. Missing = product feels incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Virtual camera device visible in browser | Core premise of the product — without this, nothing works | High | v4l2loopback on Linux; must survive browser permission checks |
| Virtual microphone device visible in browser | Core premise — AI output path | High | PulseAudio/PipeWire null sink + loopback module |
| Capture outgoing audio from Meet participants | AI twin needs to hear what's said | High | Must capture Meet's audio output stream, not system default |
| Stream captured audio to AI API in realtime | Sub-2s latency requires streaming, not batch | High | Chunked PCM/WebSocket streaming to Gemini Live or equivalent |
| Receive AI-generated audio and play through virtual mic | Completes the bidirectional loop | High | Must handle streaming audio chunks, not wait for full response |
| Configurable persona via system prompt | Users expect to tell the AI who it is and what the meeting is about | Low | System prompt: name, role, background, meeting context |
| Graceful silence / hold behavior | AI must not output audio when it shouldn't (no phantom responses) | Medium | VAD-gated output; silence when no turn to speak |
| Static or minimal placeholder video frame | Browser will mute or warn if no video stream is present | Low | Single PNG/JPEG fed at ~1fps is sufficient for v1 |
| Low-latency audio round-trip | Conversational feel requires < 2s end-to-end | High | Pipeline latency budget: capture → API → playback |
| Works on Linux (WSL2 + native) | Platform constraint is non-negotiable | High | v4l2loopback, PulseAudio, PipeWire all must function in WSL2 |
| Human operator can monitor the call | Operator sits behind the browser watching; must be able to hear what's happening | Low | Standard — operator uses the same browser tab |

---

## Differentiators

Features that go beyond table stakes and create competitive or UX advantage. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Voice Activity Detection (VAD) — speaker turn awareness | AI knows when it should speak vs listen; prevents talking over others | Medium | WebRTC VAD, Silero VAD, or API-side; eliminates awkward interruptions |
| Echo cancellation on captured audio | Prevents AI output from looping back into the capture path | Medium | Software AEC (e.g., speex, WebRTC AEC module) or separate virtual sink/source topology prevents this architecturally |
| Noise suppression on captured audio | Cleans up participant audio before sending to AI API | Medium | RNNoise, Krisp-style models, or API-side preprocessing |
| Operator override / intervene capability | Operator can type or speak and inject content into the AI's next response | High | Requires IPC between monitoring UI and audio pipeline; adds a "feed" channel |
| Live transcript display for operator | Operator sees what participants said and what AI responded | Medium | Whisper or API-returned transcripts; displayed in terminal or minimal UI |
| Participant join/leave awareness | AI twin can greet new participants or acknowledge departures | Medium | Requires scraping Meet DOM or monitoring participant list via browser automation |
| Conversation memory within session | AI remembers earlier parts of the call; context window management | Medium | Ring buffer of transcript; summarization when context fills |
| Per-meeting context injection | Operator can inject meeting-specific context before the call (agenda, attendee bios) | Low | Prepended to system prompt; simple but high value |
| Persona switching mid-call | Change the AI's persona/instructions without hanging up | Medium | Hot-reload of system prompt; may require API session restart |
| Configurable response style (formal/casual/brief/verbose) | Matches the AI's communication style to the meeting type | Low | Style parameters in system prompt |
| Wake word / activation trigger | AI only responds after hearing its name or a trigger phrase | Medium | Useful when multiple people talk; reduces spurious responses |
| Auto-mute when operator intervenes | If operator speaks physically, AI stays quiet | Medium | Requires monitoring physical mic activity and suppressing AI output |
| Confidence threshold tuning | Operator can tune how aggressively AI responds to ambiguous speech | Low | Exposed as config parameter |
| Session summary generation | At call end, AI generates a brief summary of what was discussed | Low | Post-processing step; easy add-on once transcript exists |

---

## Anti-Features

Features to explicitly NOT build — they create complexity without proportional value for this project's scope.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Browser automation / auto-join | Fragile against Meet UI changes; Playwright/Puppeteer approach requires constant maintenance; out of scope for v1 | User joins manually and selects virtual devices |
| AI-generated video / avatar | Real-time video synthesis (Wav2Lip, D-ID style) is high latency, GPU-intensive, and not required for a convincing audio twin | Static placeholder image; defer video to a later milestone |
| Zoom / Teams support | Different virtual device behaviors, different audio routing; dilutes v1 focus | Google Meet first; add other platforms only after core is validated |
| Persistent conversation storage / transcription archiving | Privacy risk; scope creep; not needed for live interaction | No storage; session data lives in memory only |
| Multi-call support | Device routing becomes ambiguous; process isolation gets complex | One active call per process instance |
| Voice cloning / voice matching | Legally and ethically fraught; high complexity; out of scope | Use AI API's default or configurable voice |
| Real-time sentiment analysis dashboard | Adds UI complexity for marginal value in v1 | Defer; transcript is sufficient for operator monitoring |
| Automatic call scheduling / calendar integration | Third-party OAuth, reliability surface; not core to the twin experience | User initiates manually |
| Full Web UI / control panel | Over-engineering for v1; terminal/config-file approach is faster to ship | CLI + config file; consider minimal UI later |
| Cloud deployment / SaaS mode | Requires audio device virtualization in cloud, which is highly non-trivial | Local-only for v1 |

---

## Feature Dependencies

```
Virtual camera device
  └── Static video frame feed (requires device to exist first)

Virtual microphone device
  └── AI audio playback (requires device to exist first)
  └── Echo cancellation topology (requires virtual sink/source layout)

Capture outgoing audio from Meet participants
  └── VAD — speaker turn detection (requires audio stream)
  └── Noise suppression (requires audio stream)
  └── Live transcript display (requires audio stream)
  └── AI API streaming (requires audio stream)

AI API streaming
  └── Bidirectional audio loop (requires both capture + playback)
  └── Conversation memory (requires transcript from API)
  └── Session summary (requires transcript from API)

Configurable persona / system prompt
  └── Per-meeting context injection (extension of system prompt)
  └── Persona switching mid-call (hot reload of system prompt)
  └── Operator override (injects into prompt or conversation)

VAD — speaker turn detection
  └── Wake word / activation trigger (specialization of VAD)
  └── Auto-mute when operator intervenes (requires VAD + physical mic monitoring)

Live transcript display
  └── Operator override / intervene (operator needs to see conversation to know when to intervene)
  └── Session summary generation (transcript is the input)
```

---

## MVP Recommendation

The v1 milestone should achieve a working bidirectional audio loop with persona configuration. Everything else is a future enhancement.

**Prioritize:**
1. Virtual camera device (v4l2loopback) — gate for everything else
2. Virtual microphone device (PulseAudio/PipeWire) — gate for audio output
3. Capture Meet audio output stream — hardest unsolved problem
4. AI API streaming round-trip (Gemini Live or STT+LLM+TTS pipeline)
5. Static placeholder video frame through virtual camera
6. Configurable persona via system prompt

**Near-term value adds (post-v1 MVP, before differentiators):**
- VAD — without this the AI will interrupt and produce poor conversation flow; nearly table stakes
- Echo cancellation topology — without architectural isolation, the AI hears its own voice and loops

**Defer until validated:**
- Operator override / intervene: adds IPC complexity; validate basic loop first
- Live transcript: nice for monitoring but not required for the loop to function
- Participant awareness: requires DOM scraping or automation, which is explicitly out of scope for v1
- Session summary: trivial once transcript exists; not needed for v1

---

## Domain-Specific Notes

### VAD Is Nearly Table Stakes

Voice Activity Detection sits on the border between table stakes and differentiator. Without it, the AI responds to every sound fragment (keyboard clicks, background noise, partial sentences). For a convincing digital twin, VAD is required for acceptable conversation quality. However, some AI APIs (Gemini Live) handle VAD server-side, which reduces the client-side burden. If the chosen API provides server-side VAD, this shifts from "must build" to "must configure."

**Confidence: MEDIUM** — Gemini Live API VAD behavior based on training data; verify against current documentation.

### Echo Cancellation Is Architectural

The best way to handle echo cancellation in this system is not a software filter but a topological solution: the virtual microphone (AI output) must feed into a different audio sink/source than the virtual speaker (Meet output capture). If these are properly isolated in PulseAudio/PipeWire, the AI never hears its own output, eliminating the echo problem entirely. Software AEC is a fallback if the routing cannot be cleanly isolated.

**Confidence: HIGH** — Standard PulseAudio loopback topology.

### Audio Capture from Meet Is the Hard Problem

Google Meet outputs audio through the browser's audio graph. Capturing that audio on Linux requires either: (a) a PulseAudio monitor source that captures all audio or a specific sink's output, or (b) a virtual audio device that the browser sends output to. This is the least-solved piece of the architecture and the area most likely to require iteration. It is not a feature decision — it is a core implementation challenge that affects all audio features.

**Confidence: MEDIUM** — PulseAudio monitor sources work in principle; WSL2 audio behavior adds uncertainty.

### Gemini Live API vs STT+LLM+TTS Pipeline

This is a critical feature-shaping decision:

- **Gemini Live (multimodal streaming):** Audio-in, audio-out, single API, built-in VAD, natural turn-taking, lower complexity. Confidence: MEDIUM — API maturity and audio quality require verification.
- **STT + LLM + TTS pipeline:** More control over each stage (Whisper for STT, any LLM, Google/ElevenLabs TTS), but higher latency, more moving parts, harder to get under 2s. Confidence: HIGH — well-understood pipeline pattern.

For v1 targeting sub-2s latency with conversational feel, Gemini Live is the recommended path if the API is production-stable. The STT+LLM+TTS approach is the fallback.

---

## Competitor Feature Landscape

(Based on training data through August 2025 — LOW to MEDIUM confidence; verify against current products.)

| Product | Approach | Key Features | Gaps vs This Project |
|---------|----------|--------------|----------------------|
| Recall.ai | Bot joins as participant via browser automation | Transcription, recording, structured data extraction | No AI conversation; observer only, not participant |
| Otter.ai | Bot joins, transcribes, summarizes | Live transcription, action items, summaries | No AI conversation; passive observer |
| Fireflies.ai | Bot joins, records, searchable transcripts | Transcription, search, CRM integrations | No AI conversation; passive observer |
| Daily.co | WebRTC infrastructure + bots | Programmable video/audio, media processing | Infrastructure layer, not a product; high complexity |
| Krisp | Noise/echo cancellation overlay | Noise suppression, echo cancellation, as virtual device | Not an AI agent; single-purpose audio processing |
| HeyGen Interactive Avatar | AI video avatar | Real-time lip-sync avatar | Video-focused; no meeting integration |

**Key gap this project fills:** No mainstream product provides a conversational AI twin that actively speaks as a participant through standard virtual device selection. Most bots are observers (transcription, recording) not participants (speaking, responding). This is the differentiated territory.

---

## Sources

- Training data (through August 2025): Recall.ai docs, Daily.co documentation, Gemini Live API announcements, PulseAudio/PipeWire documentation, WebRTC VAD and AEC specifications
- External web research: UNAVAILABLE during this session (tool permissions denied)
- All claims from external research needed for validation — particularly: Gemini Live API current capabilities, WSL2 PipeWire audio behavior, Meet audio capture approaches
- Confidence levels: HIGH = well-established technical patterns | MEDIUM = known but needs current-doc verification | LOW = training data only, verify before relying on
