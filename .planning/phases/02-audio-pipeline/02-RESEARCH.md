# Phase 2: Audio Pipeline - Research

**Researched:** 2026-03-25
**Domain:** PulseAudio audio capture/playback, Node.js streams, WSL2 audio bridging
**Confidence:** HIGH

## Summary

Phase 2 builds bidirectional audio: capturing Chrome's output (Meet participant voices) into a Node.js readable stream, and playing PCM audio back through the virtual microphone. The core technology is PulseAudio's `parec` (capture from sink monitor) and `pacat` (play to sink) commands, spawned as long-running child processes with stdout/stdin piped to Node.js streams.

The WSL2 path requires a TCP socket relay since PulseAudio runs on Windows (not inside WSL2). The relay bridges PCM data between Node.js in WSL2 and Windows-side PulseAudio or VB-Cable devices. Platform detection already exists — the audio pipeline factory selects the right implementation transparently.

The feedback isolation guarantee comes from PulseAudio's sink architecture: capture reads from `ai_meet_sink.monitor` while output writes to `ai_meet_mic` — two completely separate null-sink modules already created by `VirtualAudioDevices` in Phase 1. An automated test plays a tone through output and verifies it does NOT appear in the capture stream.

**Primary recommendation:** Use `parec`/`pacat` subprocess pipes for native Linux, TCP relay for WSL2, with a unified `AudioCapture`/`AudioOutput` interface selected by factory based on `detectPlatform()`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Use parec (PulseAudio) on native Linux to record from the sink monitor source
- Route Chrome's audio to ai_meet_sink, capture from that sink's monitor
- Expose captured audio as a Node.js Readable stream (subprocess stdout piped)
- Auto-reconnect if the capture subprocess dies — emit 'reconnecting' event
- Separate sinks for capture and output — PulseAudio routing keeps them separate
- Output path uses pacat writing PCM to the virtual mic sink stdin
- Automated verification test: play known PCM tone through output, verify NOT in capture
- Standard internal format: 16kHz, 16-bit signed LE, mono (s16le)
- Include basic typed PCM conversion utilities tested against known data
- RMS level events emitted periodically from both streams
- TCP socket relay for WSL2-Windows boundary
- Auto-launch Windows relay via powershell.exe from WSL2
- Unified AudioCapture/AudioOutput interface — factory picks implementation
- WSL2 must work end-to-end — primary dev environment

### Claude's Discretion
- Exact subprocess management details (spawn options, buffer sizes)
- TCP relay protocol design (framing, handshake)
- Chunk size and timing for stream events
- Error message formatting and logging verbosity

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUDI-01 | Capture incoming audio from Google Meet participants via virtual audio routing | parec from ai_meet_sink.monitor → Node.js Readable stream; WSL2 TCP relay alternative |
| AUDI-04 | Echo cancellation via architectural sink isolation — AI output does not loop back into capture path | Separate PulseAudio null-sinks (ai_meet_sink for capture, ai_meet_mic for output); automated isolation test |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js child_process (spawn) | Built-in | Long-running parec/pacat subprocesses | Native, zero-dependency, direct stream piping |
| Node.js stream (Readable/Writable) | Built-in | PCM data flow through pipeline | Standard Node.js streaming interface |
| Node.js net (TCP) | Built-in | WSL2-Windows audio relay | Low-level, minimal overhead for raw PCM transport |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js events (EventEmitter) | Built-in | RMS level events, reconnection signals | Base class for AudioCapture/AudioOutput |
| Buffer | Built-in | PCM format conversion utilities | s16le parsing, RMS calculation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| parec/pacat subprocess | node-pulseaudio native binding | Native binding adds build dependency, C++ compilation issues on WSL2; parec/pacat are universally available |
| Raw TCP relay | WebSocket | Unnecessary framing overhead for local PCM transport; TCP is simpler and faster |
| Custom PCM utils | sox/ffmpeg pipe | Extra process overhead for simple bit math; inline Buffer operations are faster for s16le |

**Installation:**
```bash
# No new npm packages required — all Node.js built-ins
# System dependencies (already present from Phase 1):
# - pulseaudio-utils (provides parec, pacat, pactl)
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── audio/
│   ├── capture.ts          # AudioCapture interface + NativeAudioCapture (parec)
│   ├── output.ts           # AudioOutput interface + NativeAudioOutput (pacat)
│   ├── factory.ts          # createAudioCapture/createAudioOutput factory functions
│   ├── pcm-utils.ts        # PCM format conversion, RMS calculation
│   ├── wsl2-relay.ts       # WSL2 TCP relay client (connects to Windows-side server)
│   ├── wsl2-relay-server.ts # Windows-side TCP relay server (PowerShell-launched)
│   ├── capture.test.ts     # Unit tests for capture
│   ├── output.test.ts      # Unit tests for output
│   ├── pcm-utils.test.ts   # PCM conversion tests with known data
│   └── isolation.test.ts   # Feedback isolation verification test
├── config/
├── devices/
├── platform/
└── index.ts
```

### Pattern 1: Subprocess-backed Stream
**What:** Wrap a long-running subprocess (parec/pacat) in a Node.js stream interface with lifecycle management.
**When to use:** Any PulseAudio tool that produces/consumes continuous PCM data.
**Example:**
```typescript
import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { type Readable } from 'stream';

class NativeAudioCapture extends EventEmitter {
  private proc: ChildProcess | null = null;
  private reconnecting = false;

  constructor(
    private sinkMonitor: string,  // e.g. "ai_meet_sink.monitor"
    private format: string,        // e.g. "s16le"
    private rate: number,          // e.g. 16000
    private channels: number       // e.g. 1
  ) { super(); }

  start(): Readable {
    this.proc = spawn('parec', [
      '--device', this.sinkMonitor,
      '--format', this.format,
      '--rate', String(this.rate),
      '--channels', String(this.channels),
      '--latency-msec', '20',
    ]);

    this.proc.on('exit', (code) => {
      if (!this.reconnecting) {
        this.emit('reconnecting');
        this.reconnecting = true;
        setTimeout(() => this.start(), 1000);
      }
    });

    return this.proc.stdout!;
  }

  stop(): void {
    this.reconnecting = true; // prevent auto-reconnect
    this.proc?.kill('SIGTERM');
    this.proc = null;
  }
}
```

### Pattern 2: Platform Factory
**What:** Factory function returns the correct implementation based on detectPlatform().
**When to use:** Any component that differs between native Linux and WSL2.
**Example:**
```typescript
import { detectPlatform } from '../platform/detect.js';

export function createAudioCapture(sinkName: string, config: AudioConfig): AudioCapture {
  const platform = detectPlatform();
  if (platform === 'wsl2') {
    return new Wsl2AudioCapture(sinkName, config);
  }
  return new NativeAudioCapture(`${sinkName}.monitor`, config);
}
```

### Pattern 3: RMS Level Monitoring
**What:** Periodically compute RMS of PCM chunks and emit level events.
**When to use:** Both capture and output streams for "audio is flowing" visibility.
**Example:**
```typescript
function computeRms(buffer: Buffer): number {
  let sumSquares = 0;
  const samples = buffer.length / 2; // s16le = 2 bytes per sample
  for (let i = 0; i < buffer.length; i += 2) {
    const sample = buffer.readInt16LE(i);
    sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / samples);
}
```

### Anti-Patterns to Avoid
- **Recording from default source instead of specific sink monitor:** Always specify `--device ai_meet_sink.monitor` explicitly. Default source changes based on user's PulseAudio configuration.
- **Using `exec` instead of `spawn`:** `exec` buffers stdout — for continuous audio streaming, `spawn` with piped stdout is required.
- **Ignoring subprocess stderr:** parec/pacat print errors to stderr — pipe it and log it for debugging.
- **Hardcoded sink names:** Use config values from `Config.devices.sink.sinkName` and `Config.devices.mic.sinkName`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audio capture from PulseAudio | Custom PulseAudio protocol client | `parec` CLI tool | PulseAudio's native protocol is complex, undocumented for external clients |
| Audio playback to PulseAudio | Custom PulseAudio protocol client | `pacat` CLI tool | Same reason — CLI tools are the stable public interface |
| PCM resampling (if needed) | Custom resampler | `sox` or `ffmpeg` pipe for complex conversions | Resampling correctly is mathematically non-trivial |
| TCP framing | Custom binary protocol | Length-prefixed frames (4-byte LE header + payload) | Simple, debuggable, adequate for local PCM relay |

**Key insight:** PulseAudio's CLI tools (`parec`, `pacat`) are the correct interface for external processes to interact with PulseAudio. The native C API/protocol is for PulseAudio modules and clients compiled against libpulse — not for Node.js subprocesses.

## Common Pitfalls

### Pitfall 1: Sink Monitor Name Format
**What goes wrong:** Using `ai_meet_sink` as the parec device instead of `ai_meet_sink.monitor`
**Why it happens:** PulseAudio sinks and monitors have different names. The sink is where audio is routed TO; the monitor is where you can RECORD FROM.
**How to avoid:** Always append `.monitor` to the sink name when using parec: `parec --device ai_meet_sink.monitor`
**Warning signs:** parec connects but produces silence.

### Pitfall 2: Buffer Backpressure on Subprocess Stdout
**What goes wrong:** If the Node.js consumer doesn't read fast enough, the subprocess stdout buffer fills up, causing parec to block or die.
**Why it happens:** parec produces continuous PCM at 16kHz/16-bit/mono = 32KB/sec. If the consumer stalls, the pipe buffer (~64KB on Linux) fills in ~2 seconds.
**How to avoid:** Always consume stdout immediately. Use stream.pipe() or event-driven reading. Never let the consumer block.
**Warning signs:** Audio gaps, subprocess unexpectedly exits.

### Pitfall 3: Subprocess Zombie on Unclean Shutdown
**What goes wrong:** parec/pacat processes survive Node.js exit, consuming CPU and holding PulseAudio resources.
**Why it happens:** Node.js doesn't automatically kill child processes on exit.
**How to avoid:** Register subprocess cleanup in DeviceManager.shutdown() and SIGINT/SIGTERM handlers. Use `proc.kill('SIGTERM')` explicitly.
**Warning signs:** `ps aux | grep parec` shows orphaned processes after Node.js exits.

### Pitfall 4: WSL2 PulseAudio Not Available
**What goes wrong:** WSL2 doesn't have PulseAudio server running — parec/pacat won't work.
**Why it happens:** WSL2's audio is routed through Windows. PulseAudio CLI tools need a running server.
**How to avoid:** WSL2 path MUST use the TCP relay to Windows-side audio, not parec/pacat directly.
**Warning signs:** `pactl info` fails inside WSL2 with "Connection refused".

### Pitfall 5: TCP Relay Byte Ordering
**What goes wrong:** PCM data arrives in wrong byte order or with frame misalignment.
**Why it happens:** TCP is a stream protocol with no message boundaries. A single `data` event may contain partial frames.
**How to avoid:** Use length-prefixed framing: 4-byte LE uint32 header indicating payload size, then exactly that many bytes of PCM data.
**Warning signs:** Crackling audio, pitch-shifted playback.

## Code Examples

### parec Capture with Auto-Reconnect
```typescript
// Capture Meet audio from sink monitor
const proc = spawn('parec', [
  '--device', 'ai_meet_sink.monitor',
  '--format', 's16le',
  '--rate', '16000',
  '--channels', '1',
  '--latency-msec', '20',
]);

proc.stdout.on('data', (chunk: Buffer) => {
  // chunk is raw s16le PCM data
  // Forward to AI API in Phase 4
});

proc.stderr.on('data', (data: Buffer) => {
  console.error(`[parec] ${data.toString()}`);
});
```

### pacat Output to Virtual Mic
```typescript
// Play AI audio through virtual microphone
const proc = spawn('pacat', [
  '--device', 'ai_meet_mic',
  '--format', 's16le',
  '--rate', '16000',
  '--channels', '1',
  '--latency-msec', '20',
]);

// Write PCM data to pacat stdin
function writePcm(buffer: Buffer): void {
  proc.stdin.write(buffer);
}

// Graceful shutdown
function stop(): void {
  proc.stdin.end();
  proc.kill('SIGTERM');
}
```

### RMS Level Calculation for s16le
```typescript
function computeRmsLevel(pcmBuffer: Buffer): number {
  const sampleCount = pcmBuffer.length / 2;
  if (sampleCount === 0) return 0;

  let sumSquares = 0;
  for (let i = 0; i < pcmBuffer.length; i += 2) {
    const sample = pcmBuffer.readInt16LE(i);
    sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / sampleCount);
}

// Normalized to 0-1 range (for UI/logging)
function computeRmsNormalized(pcmBuffer: Buffer): number {
  return computeRmsLevel(pcmBuffer) / 32768;
}
```

### TCP Relay Length-Prefixed Protocol
```typescript
import { createServer, type Socket } from 'net';

// Frame format: [4 bytes LE uint32 length] [payload bytes]
function writeFrame(socket: Socket, payload: Buffer): void {
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length);
  socket.write(header);
  socket.write(payload);
}

// Reading frames (accumulate until complete frame available)
class FrameReader {
  private buffer = Buffer.alloc(0);

  feed(data: Buffer): Buffer[] {
    this.buffer = Buffer.concat([this.buffer, data]);
    const frames: Buffer[] = [];
    while (this.buffer.length >= 4) {
      const len = this.buffer.readUInt32LE(0);
      if (this.buffer.length < 4 + len) break;
      frames.push(this.buffer.subarray(4, 4 + len));
      this.buffer = this.buffer.subarray(4 + len);
    }
    return frames;
  }
}
```

### WSL2 Relay Auto-Launch via PowerShell
```typescript
import { spawn } from 'child_process';

function launchWindowsRelay(port: number): ChildProcess {
  // Launch the relay server on Windows side via powershell.exe
  const scriptPath = 'scripts/wsl2-audio-relay.ps1';
  const proc = spawn('powershell.exe', [
    '-ExecutionPolicy', 'Bypass',
    '-File', scriptPath,
    '-Port', String(port),
  ], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return proc;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PipeWire native protocol | PulseAudio compat layer (parec/pacat work on both) | PipeWire 0.3+ | No code change needed — PipeWire exposes PulseAudio-compatible CLI |
| ALSA direct capture | PulseAudio monitor sources | PulseAudio era | parec from monitor is the standard way to capture application audio |
| node-pulseaudio npm | spawn parec/pacat | Always preferred for external apps | Avoids native compilation, works on all Linux distros |

## Open Questions

1. **WSL2 Windows-side audio relay implementation language**
   - What we know: Need a process on Windows that connects to VB-Cable and relays PCM over TCP to WSL2
   - What's unclear: Whether PowerShell can efficiently handle raw PCM relay, or if a compiled tool (e.g., Go/Rust binary, or a Node.js script running in Windows) would be needed
   - Recommendation: Start with a Node.js script launched via `node.exe` on Windows (more portable than PowerShell for binary data), fall back to PowerShell if Node.js isn't available on Windows

2. **parec latency tuning**
   - What we know: `--latency-msec` controls buffer size. Lower = less latency but more CPU overhead
   - What's unclear: Optimal value for conversational AI (needs to be responsive but not wasteful)
   - Recommendation: Start with 20ms, instrument actual latency, tune if needed in Phase 4

## Sources

### Primary (HIGH confidence)
- PulseAudio CLI man pages: parec(1), pacat(1) — capture/playback commands, format options
- Node.js docs: child_process.spawn, stream.Readable — subprocess piping
- Node.js docs: net module — TCP server/client for relay

### Secondary (MEDIUM confidence)
- Phase 1 codebase: VirtualAudioDevices creates ai_meet_sink and ai_meet_mic as separate null-sink modules
- Phase 1 decisions: WSL2 uses windows-bridge path with VB-Cable

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Node.js built-ins and PulseAudio CLI tools are well-established
- Architecture: HIGH - subprocess-backed streams is the standard pattern for CLI audio tools
- Pitfalls: HIGH - common PulseAudio/subprocess issues are well-documented
- WSL2 relay: MEDIUM - TCP relay design is straightforward but Windows-side implementation has unknowns

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable domain, slow-moving technology)
