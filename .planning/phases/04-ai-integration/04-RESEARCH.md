# Phase 4: AI Integration - Research

**Researched:** 2026-03-25
**Domain:** Gemini Live API WebSocket audio streaming, session management, persona configuration
**Confidence:** MEDIUM

## Summary

Phase 4 wires the existing audio capture/output pipeline to the Gemini Live API via WebSocket. The `@google/genai` SDK provides a high-level `ai.live.connect()` interface for Node.js server-side usage, handling the WebSocket protocol internally. The critical technical detail is an audio format mismatch: the project's internal format is 16kHz/16-bit/mono PCM (matching Gemini's input requirement), but Gemini Live returns audio at 24kHz/16-bit/mono PCM. A sample rate conversion step is needed on the output path before writing to the virtual microphone (which expects 16kHz).

The WebSocket protocol uses JSON messages with base64-encoded audio. The setup message configures the model, system instruction (for persona), and response modalities. Audio is sent via `realtimeInput` messages and received in `serverContent` messages. Sessions have a 15-minute limit for audio-only interactions and a 128k token context window for native audio models.

**Primary recommendation:** Use the `@google/genai` SDK's `ai.live.connect()` for WebSocket management rather than raw WebSocket — it handles the protocol, setup handshake, and message framing. Implement a thin wrapper around the SDK session for reconnection logic, latency tracking, and audio format conversion.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- API key via `GEMINI_API_KEY` environment variable only — no secrets in config files
- Auto-reconnect with exponential backoff, limited to 3-5 retries before stopping and notifying operator
- Distinguish transient errors (network) from permanent errors (auth/quota) — don't retry permanent failures
- During reconnection, virtual mic goes silent — no buffering or replay of missed audio
- Operator notified when retries exhausted
- Stream playback as chunks arrive — no buffering full responses. Play AI audio through virtual mic immediately for natural conversational flow
- Always stream audio to the API regardless of silence — let the API handle VAD/silence detection
- Audio format: existing 16kHz/16-bit/mono PCM from AudioCapture is the starting point
- Persona configuration lives in the main config file (Zod schema) as a `persona` section alongside devices/audio/video
- Fields: `name` (string), `role` (string), `background` (string), `instructions` (freeform string for behavioral guidance)
- Configurable `introduceOnStart` boolean — controls whether AI introduces itself when it first speaks
- Sensible defaults for all fields so it works out of the box with minimal config
- System prompt constructed from persona fields and sent on WebSocket session start
- Measure round-trip latency via timestamp markers: mark when audio chunk leaves capture, measure when first AI response byte arrives
- Moderate logging level: connection events, reconnections, latency per exchange, audio level warnings
- Periodic console summary line printed every N seconds showing latency stats — operator sees it live
- Log a warning when round-trip exceeds 2s threshold

### Claude's Discretion
- WebSocket session startup sequence (handshake vs immediate streaming) — follow Gemini Live API behavior
- Optimal audio chunk size for the API — balance between latency and efficiency
- Audio format conversion strategy if Gemini expects different format than 16kHz/16-bit/mono
- Latency summary interval and formatting
- Exact backoff timing for reconnection attempts
- Default persona values

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUDI-02 | Stream captured audio to Google AI API in realtime (chunked PCM/WebSocket) | @google/genai SDK `ai.live.connect()` + `session.sendRealtimeInput()` handles streaming. Input format 16kHz/16-bit PCM matches project's AUDIO_FORMAT. Base64 encode chunks before sending. |
| AUDI-03 | Receive AI-generated audio responses and play through virtual microphone into Meet | SDK callbacks receive `serverContent` with base64 audio at 24kHz. Decode + downsample to 16kHz before writing to AudioOutput Writable stream. |
| AUDI-05 | Low-latency audio round-trip under 2 seconds for conversational feel | Stream chunks immediately (no buffering). Track timestamps on send/receive for latency measurement. Gemini Live is designed for real-time conversation. |
| CONV-01 | Configurable persona via system prompt (name, role, background, meeting context) | `systemInstruction` field in setup config accepts persona text. Extend ConfigSchema with persona section. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @google/genai | latest (^1.x) | Gemini Live API SDK — WebSocket management, message framing, session lifecycle | Official Google SDK for Gemini API, handles WebSocket protocol internally |
| ws | ^8.x | WebSocket implementation for Node.js (peer dependency of @google/genai in server env) | Standard Node.js WebSocket library, may be needed by SDK |

### Supporting
| Library | Purpose | When to Use |
|---------|---------|-------------|
| (none — use Node.js built-ins) | Buffer for base64 encode/decode, stream Transform for sample rate conversion | Audio processing is simple PCM operations — no external DSP library needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @google/genai SDK | Raw WebSocket + manual JSON protocol | More control but must handle setup handshake, message framing, error codes manually. SDK is simpler and maintained by Google. |
| Node.js Buffer for resampling | sox/ffmpeg subprocess for resampling | External process adds latency. Linear interpolation in JS is fast enough for 24kHz→16kHz downsampling on small chunks. |

**Installation:**
```bash
npm install @google/genai
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── ai/                    # NEW — Phase 4
│   ├── types.ts           # GeminiSession interface, events, config types
│   ├── session.ts         # GeminiLiveSession class — wraps SDK, reconnection, latency
│   ├── audio-converter.ts # 24kHz→16kHz PCM downsampling (Transform stream)
│   ├── persona.ts         # Build system prompt from persona config
│   └── index.ts           # Public exports
├── audio/                 # EXISTING — no changes needed
├── config/
│   └── schema.ts          # MODIFY — add persona + ai sections
├── ...
```

### Pattern 1: SDK Session Wrapper
**What:** Thin class wrapping `@google/genai` Live session with reconnection, error classification, and latency tracking.
**When to use:** All Gemini Live API interactions go through this wrapper.
**Example:**
```typescript
// Source: https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket
import { GoogleGenAI, Modality } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const session = await ai.live.connect({
  model: 'gemini-2.5-flash-native-audio-preview-12-2025',
  config: {
    responseModalities: [Modality.AUDIO],
    systemInstruction: {
      parts: [{ text: 'You are a helpful meeting participant...' }],
    },
  },
  callbacks: {
    onopen: () => console.log('[AI] Connected'),
    onmessage: (msg) => { /* handle serverContent audio */ },
    onerror: (err) => { /* classify + maybe reconnect */ },
    onclose: () => { /* trigger reconnect if not intentional */ },
  },
});

// Send audio chunk (base64-encoded PCM)
session.sendRealtimeInput({ audio: { data: chunk.toString('base64'), mimeType: 'audio/pcm;rate=16000' } });
```

### Pattern 2: Error Classification for Reconnection
**What:** Classify WebSocket errors as transient (network, timeout) vs permanent (auth, quota) to decide retry behavior.
**When to use:** In the `onerror` and `onclose` callbacks.
**Example:**
```typescript
function isTransientError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  // Permanent: auth failures, quota exceeded, invalid API key
  if (msg.includes('401') || msg.includes('403') || msg.includes('429') || msg.includes('invalid')) {
    return false;
  }
  // Transient: network errors, timeouts, connection reset
  return true;
}
```

### Pattern 3: Stream-Through Audio Processing
**What:** Use Node.js Transform stream to process audio chunks (base64 decode, sample rate convert) in a streaming pipeline.
**When to use:** On the receive path — Gemini returns 24kHz audio, virtual mic expects 16kHz.
**Example:**
```typescript
import { Transform } from 'stream';

// Linear interpolation downsampler: 24kHz → 16kHz (ratio 3:2)
class Downsampler extends Transform {
  _transform(chunk: Buffer, _encoding: string, callback: Function) {
    const samples = chunk.length / 2; // 16-bit = 2 bytes per sample
    const outSamples = Math.floor(samples * 2 / 3);
    const out = Buffer.alloc(outSamples * 2);
    for (let i = 0; i < outSamples; i++) {
      const srcPos = i * 1.5;
      const srcIdx = Math.floor(srcPos);
      const frac = srcPos - srcIdx;
      const s0 = chunk.readInt16LE(srcIdx * 2);
      const s1 = srcIdx + 1 < samples ? chunk.readInt16LE((srcIdx + 1) * 2) : s0;
      out.writeInt16LE(Math.round(s0 + frac * (s1 - s0)), i * 2);
    }
    callback(null, out);
  }
}
```

### Anti-Patterns to Avoid
- **Buffering full AI responses before playing:** Destroys conversational feel. Stream each chunk immediately.
- **Using raw WebSocket instead of SDK:** The `@google/genai` SDK handles the BidiGenerateContent protocol, setup handshake, and message framing. Don't reimplement.
- **Retrying permanent errors:** Auth failures (401/403) and quota (429) won't recover with retry. Fail fast and notify operator.
- **Sending audio format headers every chunk:** The MIME type in `realtimeInput` already specifies format. Don't add WAV headers or extra framing.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket protocol for Gemini | Raw WS + JSON message construction | `@google/genai` SDK `ai.live.connect()` | Protocol evolves; SDK tracks API changes |
| Complex audio resampling | Full FFT-based resampler | Simple linear interpolation for 24kHz→16kHz | 3:2 ratio is clean; linear interp is adequate for voice audio |
| VAD (Voice Activity Detection) | Client-side silence detection | Gemini's built-in `automaticActivityDetection` | API handles it natively; user decision says "let the API handle VAD" |

**Key insight:** The SDK abstracts the WebSocket protocol. The only non-trivial custom code needed is: (1) reconnection with backoff, (2) error classification, (3) 24kHz→16kHz downsampling, (4) latency tracking.

## Common Pitfalls

### Pitfall 1: Audio Format Mismatch (24kHz output vs 16kHz internal)
**What goes wrong:** Gemini Live returns audio at 24kHz sample rate, but the project's virtual mic pipeline expects 16kHz. Playing 24kHz audio at 16kHz speed makes it sound slow and low-pitched.
**Why it happens:** Gemini's output rate (24kHz) differs from its input rate (16kHz).
**How to avoid:** Downsample received audio from 24kHz to 16kHz before writing to the AudioOutput Writable stream.
**Warning signs:** AI voice sounds slow, deep, or distorted.

### Pitfall 2: Session Timeout (15-minute limit)
**What goes wrong:** Audio-only sessions expire after 15 minutes. The connection closes with a `goAway` message.
**Why it happens:** Gemini Live API enforces session duration limits.
**How to avoid:** Handle `goAway` messages, reconnect automatically, log the timeout event. For meetings longer than 15 minutes, the reconnect logic naturally handles this.
**Warning signs:** Connection drops at ~15 minutes, operator sees reconnection messages.

### Pitfall 3: Base64 Encoding Overhead
**What goes wrong:** Base64 encoding increases data size by ~33%, adding latency for large audio chunks.
**Why it happens:** The JSON-based WebSocket protocol requires binary data as base64 strings.
**How to avoid:** Send reasonably-sized chunks (e.g., 100-200ms of audio = 3200-6400 bytes raw PCM). Don't send 1-second+ chunks.
**Warning signs:** Latency increases, message sizes are larger than expected.

### Pitfall 4: Not Handling goAway Gracefully
**What goes wrong:** Server sends `goAway` before disconnecting. If not handled, the session dies without reconnection.
**Why it happens:** Server maintenance, session limits, or capacity management.
**How to avoid:** Listen for `goAway` in message handler, initiate reconnection before the connection actually drops.
**Warning signs:** Unexpected connection drops without reconnection attempt.

### Pitfall 5: Reconnection During Active Conversation
**What goes wrong:** Reconnecting mid-conversation loses all session context (conversation history).
**Why it happens:** Each WebSocket session starts fresh — no automatic context persistence.
**How to avoid:** Accept this as a limitation for Phase 4 (Phase 5 handles conversation memory). Log when reconnection occurs so operator knows context was lost.
**Warning signs:** AI doesn't remember previous conversation after reconnect.

## Code Examples

### Sending Audio from Capture Stream to Gemini
```typescript
// Source: Project pattern + Gemini Live API docs
const captureStream = capture.start();

captureStream.on('data', (chunk: Buffer) => {
  if (session.isConnected()) {
    const sendTimestamp = Date.now();
    session.sendAudio(chunk); // internally base64-encodes and sends realtimeInput
    latencyTracker.markSent(sendTimestamp);
  }
});
```

### Receiving and Playing AI Audio
```typescript
// Source: Gemini Live API docs + project AudioOutput pattern
session.on('audio', (base64Audio: string) => {
  const pcm24k = Buffer.from(base64Audio, 'base64'); // 24kHz PCM
  const pcm16k = downsample24to16(pcm24k); // Convert to 16kHz
  outputStream.write(pcm16k); // Write to virtual mic

  latencyTracker.markReceived(Date.now());
});
```

### Building System Prompt from Persona Config
```typescript
// Source: Project convention (Zod schema pattern)
function buildSystemPrompt(persona: PersonaConfig): string {
  const parts: string[] = [];
  parts.push(`Your name is ${persona.name}.`);
  parts.push(`Your role is: ${persona.role}.`);
  if (persona.background) parts.push(`Background: ${persona.background}`);
  if (persona.instructions) parts.push(persona.instructions);
  if (persona.introduceOnStart) {
    parts.push('When the conversation begins, briefly introduce yourself.');
  }
  return parts.join('\n');
}
```

### Exponential Backoff Reconnection
```typescript
// Standard pattern
async function reconnectWithBackoff(maxRetries: number = 5): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 30000); // 1s, 2s, 4s, 8s, 16s (capped at 30s)
    console.log(`[AI] Reconnecting in ${delayMs}ms (attempt ${attempt}/${maxRetries})`);
    await new Promise(r => setTimeout(r, delayMs));
    try {
      await connect();
      return true;
    } catch (err) {
      if (!isTransientError(err as Error)) {
        console.error(`[AI] Permanent error — not retrying: ${(err as Error).message}`);
        return false;
      }
    }
  }
  console.error(`[AI] Max retries exhausted (${maxRetries})`);
  return false;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| @google/generative-ai (old package) | @google/genai (new SDK) | 2025 | New SDK supports Live API; old one does not |
| STT + LLM + TTS pipeline | Gemini Live native audio | 2024-2025 | Single WebSocket session replaces 3 separate API calls; much lower latency |
| Manual WebSocket protocol | `ai.live.connect()` SDK method | 2025 | SDK handles handshake, message framing, type safety |

**Deprecated/outdated:**
- `@google/generative-ai` package: Old SDK, does not support Live API. Use `@google/genai` instead.
- Text-only Gemini API + separate TTS: Higher latency, more complex. Gemini Live replaces this for voice use cases.

## Open Questions

1. **Exact model availability for server-side Node.js**
   - What we know: `gemini-2.5-flash-native-audio-preview-12-2025` is documented for native audio
   - What's unclear: Whether this specific model version is still the latest or has been superseded
   - Recommendation: Use this model name, handle "model not found" errors gracefully, make model name configurable in config

2. **Session resumption capability**
   - What we know: API has `sessionResumption` in setup config and `sessionResumptionUpdate` server messages
   - What's unclear: Whether session resumption preserves conversation context across reconnections
   - Recommendation: Phase 4 reconnects as fresh sessions (acceptable per scope). Phase 5 can investigate session resumption for conversation memory.

3. **Output audio sample rate confirmation**
   - What we know: Gemini overview page states output is 24kHz. Practical code should verify.
   - What's unclear: Whether native audio models might return different rates
   - Recommendation: Build downsampler but also handle the case where output is already 16kHz (no conversion needed). Log detected output format.

## Sources

### Primary (HIGH confidence)
- [Gemini Live API Overview](https://ai.google.dev/gemini-api/docs/live-api) — capabilities, session limits, audio format
- [Gemini Live API WebSocket Guide](https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket) — setup message, realtimeInput format, JavaScript examples
- [Gemini Live API Reference](https://ai.google.dev/api/live) — message types, session config, goAway, timeouts
- [Gemini Live API Capabilities Guide](https://ai.google.dev/gemini-api/docs/live-guide) — system instructions, voice config, transcription, session limits

### Secondary (MEDIUM confidence)
- [Google Gen AI JS SDK (GitHub)](https://github.com/googleapis/js-genai) — SDK API for `ai.live.connect()`
- [Gemini Live API Examples (GitHub)](https://github.com/google-gemini/gemini-live-api-examples) — reference implementations

### Tertiary (LOW confidence)
- SDK exact API shape for `sendRealtimeInput()` — reconstructed from docs + examples, needs validation during implementation

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - SDK is confirmed, exact API methods partially documented
- Architecture: HIGH - WebSocket protocol is well-documented, project patterns are clear
- Pitfalls: HIGH - Audio format mismatch and session limits are documented facts

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (API is preview, may change)
