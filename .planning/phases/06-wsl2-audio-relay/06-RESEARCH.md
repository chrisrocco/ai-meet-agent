# Phase 6: WSL2 Audio Relay Server - Research

**Researched:** 2026-03-25
**Domain:** Node.js TCP server, Windows audio bridging (ffmpeg.exe dshow/WASAPI), WSL2 interop process spawning
**Confidence:** MEDIUM (core relay pattern HIGH; Windows audio bridge commands MEDIUM; audio split for operator monitoring MEDIUM)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Windows Audio Bridge Approach**: ffmpeg.exe on Windows is acceptable — user is willing to install it
- **VB-Cable not yet installed** — setup guide exists at scripts/setup-wsl2-windows.md
- **Capture direction split**: Operator needs to hear Meet participants through speakers AND relay must capture — need a split/mirror approach for the capture direction
- **Relay Server Lifecycle**: Embedded in the main Node.js process (src/index.ts) — not a separate process
- **Platform gating**: Only starts on WSL2 platform — skip relay startup on native Linux entirely
- **Non-fatal on failure**: Log warning and continue without audio if relay can't start (consistent with existing audio pipeline error handling pattern)
- **Startup ordering**: Relay must start BEFORE audio capture/output clients try to connect (currently clients connect immediately and get ECONNREFUSED)
- **Capture path format conversion**: Windows-side bridge process handles format conversion to 16kHz/16-bit/mono PCM before sending to relay — relay stays format-agnostic
- **Audio from Meet participants**: Must be capturable while operator also hears it through speakers — routing must split/mirror, not redirect exclusively
- **Output path**: AI response audio flows from Wsl2AudioOutput client → relay → Windows bridge → VB-Cable CABLE Input → Chrome picks up as mic
- **Output format**: 16kHz/16-bit/mono PCM from the AI pipeline (already correct format)

### Claude's Discretion

- Specific Windows audio bridge technology (ffmpeg.exe WASAPI, PowerShell audio, or other approach)
- Capture routing strategy (WASAPI loopback, dedicated VB-Cable, or other method to split Meet audio)
- Whether bridge processes are persistent or per-session
- Auto-restart behavior for bridge processes on crash
- Startup readiness signaling (wait for bridge vs accept connections immediately)
- Silence handling on output path
- Relay-level audio monitoring/logging for debugging

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PLAT-02 | Works on Linux (WSL2) with appropriate device routing for the environment | Relay server bridges WSL2 Node.js process to Windows audio devices (VB-Cable) via ffmpeg.exe subprocess spawned through WSL2 interop |
</phase_requirements>

---

## Summary

Phase 6 builds two things: (1) a TCP relay server inside the WSL2 Node.js process that accepts `capture` and `output` socket connections using the existing framing protocol, and (2) two Windows-side bridge processes (a capture bridge and an output bridge) spawned from Node.js via WSL2 interop that exchange audio with the relay over named pipes or additional TCP connections.

The relay server itself is straightforward Node.js `net.createServer()` code — the existing `FrameReader` and `writeFrame()` utilities in `src/audio/wsl2-relay.ts` already implement both sides of the framing protocol. The relay's job is: accept a `capture` client handshake, accept an `output` client handshake, and then act as a bidirectional pump (capture bridge → relay → capture client; output client → relay → output bridge).

The harder problem is the Windows audio bridges. For **capture**, ffmpeg.exe on Windows can capture audio from a DirectShow device (the "CABLE Output (VB-Audio Virtual Cable)" device that Chrome's audio plays through) and pipe raw PCM to stdout, which the relay reads. For the operator to also hear the audio, Windows' "Listen to this device" feature on CABLE Output can mirror the audio to the operator's speakers — this is a one-time manual setup, not something the bridge controls. For **output**, ffplay.exe on Windows can accept raw PCM from stdin and play it to a specific device via `-audio_device_index`; alternatively, ffmpeg.exe with its WASAPI/dshow output support may work if built with the right codecs.

WSL2 interop allows spawning Windows `.exe` files directly from Node.js `child_process.spawn()` — the kernel's binfmt mechanism handles the path translation. The existing `Wsl2VideoFeed` already demonstrates spawning Windows processes (`taskkill /F /T /PID` pattern), confirming this path works in the project.

**Primary recommendation:** Build the TCP relay server using Node.js `net` module (no new dependencies needed). Spawn ffmpeg.exe capture bridge via WSL2 interop. Spawn ffplay.exe output bridge (reads PCM from stdin, plays to `CABLE Input` device). Use the `NativeVideoFeed` auto-restart pattern for bridge lifecycle. Configure "Listen to this device" on CABLE Output as a one-time manual step for operator monitoring.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:net` | built-in | TCP server and socket management | Zero deps, used by existing `Wsl2AudioCapture`/`Wsl2AudioOutput` clients |
| `node:child_process` | built-in | Spawn Windows ffmpeg.exe/ffplay.exe bridges | Used throughout project (`NativeVideoFeed`, `Wsl2VideoFeed`) |
| `ffmpeg.exe` (Windows) | user-installed | Capture audio from dshow device → stdout PCM | Already required by project; user confirmed willing to install |
| `ffplay.exe` (Windows) | user-installed | Play PCM from stdin → Windows audio device | Ships with ffmpeg distribution; `-audio_device_index` supports device selection |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `FrameReader` (existing) | - | Parse length-prefixed TCP frames from bridge stdout | Already implemented in `src/audio/wsl2-relay.ts` |
| `writeFrame()` (existing) | - | Write framed audio to capture client sockets | Already implemented in `src/audio/wsl2-relay.ts` |
| `computeRmsNormalized()` (existing) | - | Optional relay-level audio level monitoring | Use if relay-level debugging is needed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ffmpeg.exe dshow capture | WASAPI native capture (C++ or Rust helper) | ffmpeg.exe is already a requirement and handles format conversion; no new binaries |
| ffplay.exe stdin playback | PowerShell AudioGraph API | ffplay ships with ffmpeg and needs no additional tooling |
| Windows "Listen to this device" for operator monitoring | Second ffmpeg instance tee-ing output | "Listen to this device" is a manual one-time setup, simpler and lower latency |
| TCP pipe for relay↔bridge communication | Named pipe on Windows | TCP works cross-boundary without named pipe path translation complexity |

**Installation:**
```bash
# No npm packages needed — uses built-in Node.js modules only
# Windows side: ffmpeg.exe and ffplay.exe must be installed and accessible
# Verify: ffmpeg.exe -version (from WSL2: /mnt/c/path/to/ffmpeg.exe -version)
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/audio/
├── wsl2-relay.ts           # Existing: FrameReader, writeFrame, RELAY_PORT
├── wsl2-relay-server.ts    # NEW: WslAudioRelayServer class (TCP server + bridge lifecycle)
├── wsl2-capture.ts         # Existing: Wsl2AudioCapture client (no changes)
├── wsl2-output.ts          # Existing: Wsl2AudioOutput client (no changes)
└── wsl2-relay-server.test.ts  # NEW: Unit tests for relay server
```

### Pattern 1: Relay Server Class (EventEmitter)

**What:** `WslAudioRelayServer` creates a `net.Server`, tracks the capture and output client sockets, and manages two Windows subprocess bridges.
**When to use:** Server must be started in `main()` before `createAudioCapture()` / `createAudioOutput()` are called.

```typescript
// Source: Node.js net module docs (nodejs.org/api/net.html)
import { createServer, type Server, type Socket } from 'net';
import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { FrameReader, writeFrame, RELAY_PORT } from './wsl2-relay.js';

export class WslAudioRelayServer extends EventEmitter {
  private server: Server | null = null;
  private captureClient: Socket | null = null;
  private outputClient: Socket | null = null;
  private captureProc: ChildProcess | null = null;
  private outputProc: ChildProcess | null = null;
  private stopped = false;

  async start(): Promise<void> {
    // Start bridge processes first, then TCP server
    this.spawnCaptureBridge();
    this.spawnOutputBridge();
    await this.startTcpServer();
  }

  stop(): void {
    this.stopped = true;
    this.server?.close();
    this.captureClient?.destroy();
    this.outputClient?.destroy();
    this.killBridge(this.captureProc);
    this.killBridge(this.outputProc);
  }
}
```

### Pattern 2: TCP Server with Handshake-Based Role Assignment

**What:** The server accepts connections and reads the first framed JSON message to determine whether the client is a `capture` or `output` role, then routes accordingly.
**When to use:** This is required — the framing protocol and handshake format are FIXED by the existing client code.

```typescript
// Framing protocol: fixed by Wsl2AudioCapture/Wsl2AudioOutput
private startTcpServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    this.server = createServer({ noDelay: true });

    this.server.on('connection', (socket: Socket) => {
      socket.setNoDelay(true);
      const reader = new FrameReader();

      // First frame is the handshake
      const onData = (data: Buffer) => {
        const frames = reader.feed(data);
        if (frames.length === 0) return;

        socket.removeListener('data', onData);
        const handshake = JSON.parse(frames[0].toString());

        if (handshake.type === 'capture') {
          this.captureClient = socket;
          // Forward audio from capture bridge to this socket
        } else if (handshake.type === 'output') {
          this.outputClient = socket;
          // Forward audio from this socket to output bridge
        }
      };

      socket.on('data', onData);
    });

    this.server.listen(RELAY_PORT, '127.0.0.1', () => resolve());
    this.server.once('error', reject);
  });
}
```

### Pattern 3: Capture Bridge (ffmpeg.exe dshow → stdout → capture client)

**What:** Spawn ffmpeg.exe (Windows) via WSL2 interop. It captures "CABLE Output (VB-Audio Virtual Cable)" as a DirectShow device and pipes raw PCM s16le 16kHz mono to stdout. The relay reads stdout frames and forwards them to the capture TCP client.

```typescript
// Source: FFmpeg dshow devices docs (ffmpeg.org/ffmpeg-devices.html)
// Verified command pattern:
// ffmpeg.exe -f dshow -audio_buffer_size 50 -i audio="CABLE Output (VB-Audio Virtual Cable)"
//            -f s16le -ar 16000 -ac 1 pipe:1

private spawnCaptureBridge(): void {
  const ffmpegPath = this.findWindowsExecutable('ffmpeg.exe');
  this.captureProc = spawn(ffmpegPath, [
    '-f', 'dshow',
    '-audio_buffer_size', '50',         // 50ms buffer for low latency
    '-i', `audio=CABLE Output (VB-Audio Virtual Cable)`,
    '-f', 's16le', '-ar', '16000', '-ac', '1',  // target format
    'pipe:1',                            // stdout
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  const reader = new FrameReader();  // NOT needed — ffmpeg outputs raw PCM, not framed
  this.captureProc.stdout!.on('data', (pcm: Buffer) => {
    // Chunk PCM into frames and send to capture client
    if (this.captureClient && !this.captureClient.destroyed) {
      writeFrame(this.captureClient, pcm);
    }
  });

  this.captureProc.on('exit', (code) => {
    if (!this.stopped) {
      this.emit('capture-bridge-restart');
      setTimeout(() => this.spawnCaptureBridge(), 1000); // auto-restart pattern
    }
  });
}
```

**Important note:** The capture bridge outputs raw PCM bytes, NOT framed TCP data. The relay receives raw PCM chunks from the bridge's stdout and wraps them in frames before sending to the capture client. The `FrameReader` is only needed when reading from TCP clients, not from the bridge's stdout.

### Pattern 4: Output Bridge (output client → stdin → ffplay.exe)

**What:** Spawn ffplay.exe (Windows) via WSL2 interop. It reads raw PCM s16le 16kHz mono from stdin and plays to the VB-Cable CABLE Input device.

```typescript
// Source: ffplay documentation + usercomp.com article on -audio_device_index
// ffplay.exe -f s16le -ar 16000 -ac 1 -audio_device_index N -nodisp -i pipe:0

private spawnOutputBridge(): void {
  const ffplayPath = this.findWindowsExecutable('ffplay.exe');
  this.outputProc = spawn(ffplayPath, [
    '-f', 's16le',
    '-ar', '16000',
    '-ac', '1',
    '-audio_device_index', this.outputDeviceIndex.toString(),
    '-nodisp',
    '-i', 'pipe:0',  // stdin
  ], { stdio: ['pipe', 'ignore', 'pipe'] });

  // Wire output client data to bridge stdin
  // (done when outputClient is assigned)
}

// When output client sends a framed PCM chunk, strip the frame and write raw PCM:
private forwardToOutputBridge(frame: Buffer): void {
  if (this.outputProc?.stdin && !this.outputProc.stdin.destroyed) {
    this.outputProc.stdin.write(frame);  // frame IS the raw PCM (no framing to strip here)
  }
}
```

**Important note:** The output client (`Wsl2AudioOutput`) wraps PCM chunks in length-prefixed frames before sending. The relay uses `FrameReader` to parse frames from the output client socket, then writes the unwrapped PCM payload directly to ffplay's stdin (raw PCM, not framed).

### Pattern 5: WSL2 Interop — Spawning Windows Executables

**What:** From WSL2, spawn Windows `.exe` files using their `/mnt/c/...` path. WSL2 registers a binfmt interpreter that handles execution via the interop bridge.
**When to use:** All Windows bridge processes in this phase.

```typescript
// Source: wsl.dev/technical-documentation/interop/ + existing Wsl2VideoFeed pattern
// WSL2 interop: spawn('/mnt/c/Windows/System32/cmd.exe', ['/c', 'ffmpeg.exe', ...])
// OR if ffmpeg.exe is on Windows PATH, it may be callable directly

// Check Windows PATH for ffmpeg.exe:
private findWindowsExecutable(name: string): string {
  // Common install locations
  const candidates = [
    `/mnt/c/Program Files/ffmpeg/bin/${name}`,
    `/mnt/c/Users/${process.env.USER}/AppData/Local/Microsoft/WinGet/Links/${name}`,
    name,  // fall through to PATH lookup via interop
  ];
  for (const path of candidates) {
    try { accessSync(path, constants.X_OK); return path; } catch {}
  }
  return name;  // let interop resolve
}
```

**WSL2 interop caveat:** The `$WSL_INTEROP` environment variable must be set (it is in interactive sessions but may be absent in some spawn contexts). If the relay is started from `npm run dev` (tsx), WSL_INTEROP is set from the shell environment and will be inherited by child processes — this is the normal case.

### Pattern 6: Main Entry Point Integration

**What:** Start relay server in `src/index.ts` before creating audio capture/output, wrapping in non-fatal try/catch.

```typescript
// In main(), BEFORE createAudioCapture() / createAudioOutput() (currently line ~57)
// Source: existing non-fatal audio pattern in src/index.ts:80-83

import { WslAudioRelayServer } from './audio/wsl2-relay-server.js';

let relayServer: WslAudioRelayServer | null = null;
if (platform === 'wsl2') {
  try {
    relayServer = new WslAudioRelayServer(config);
    await relayServer.start();
    console.log(`[AudioRelay] TCP relay listening on port ${RELAY_PORT}`);
  } catch (err) {
    console.warn(`[AudioRelay] Could not start relay: ${(err as Error).message}`);
    console.warn('[AudioRelay] Audio pipeline will not be active on WSL2.');
  }
}

// Then: existing audio pipeline creation
```

### Anti-Patterns to Avoid

- **Parsing raw PCM from bridge stdout with FrameReader**: The bridge process outputs raw PCM bytes, not TCP frames. `FrameReader` is only for TCP socket data.
- **Nagle's algorithm on TCP sockets**: Always call `socket.setNoDelay(true)` on both the server socket and all accepted client sockets. Nagle's algorithm will batch small PCM chunks and add latency.
- **Synchronous server startup blocking main()**: Use `server.listen()` with a Promise wrapper — do not block the event loop waiting for the port to open.
- **Spawning bridge processes after TCP clients connect**: The relay must be listening before clients try to connect. Bridges can be started before or after the TCP server, but the server must be up first.
- **Forwarding the raw frame bytes (header + payload) to ffplay stdin**: Strip the 4-byte length header before writing PCM to ffplay's stdin. ffplay expects raw PCM, not framed data.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audio format conversion to 16kHz/mono | Custom resampler | ffmpeg.exe `-ar 16000 -ac 1` at capture | ffmpeg handles resampling, channel mixing, and format conversion correctly; edge cases in resampling are numerous |
| PCM framing/deframing | Custom | Existing `FrameReader` + `writeFrame()` | Already tested in `wsl2-relay.test.ts` — 8 test cases |
| Auto-restart subprocess lifecycle | Custom retry logic | Pattern from `NativeVideoFeed` (1s timeout restart) | Already battle-tested in project for ffmpeg management |
| Windows device enumeration | PowerShell script | `ffmpeg.exe -list_devices true -f dshow -i dummy` | Built into ffmpeg; avoids PowerShell subprocess complexity |

**Key insight:** The relay has almost no business logic — it is a pump. The Windows bridges do the real work (format conversion, device I/O). Keeping the relay format-agnostic (as decided) means the relay itself is simple byte-forwarding code.

---

## Common Pitfalls

### Pitfall 1: ECONNREFUSED spam during development
**What goes wrong:** Audio clients reconnect every 1s when relay isn't running, generating log spam.
**Why it happens:** `Wsl2AudioCapture` and `Wsl2AudioOutput` both reconnect on close. If relay starts late or crashes, clients spam reconnect errors.
**How to avoid:** Start relay server BEFORE calling `createAudioCapture()` / `createAudioOutput()`. The relay's `start()` returns a Promise that resolves only after the TCP server is listening — await it before proceeding.
**Warning signs:** `ECONNREFUSED` log messages at startup; fixed by correct startup ordering.

### Pitfall 2: ffmpeg.exe device name must match exactly
**What goes wrong:** Bridge fails to start with "Could not find device with name" error.
**Why it happens:** DirectShow device names are exact strings — they differ by Windows locale, VB-Cable version, and audio driver. "CABLE Output (VB-Audio Virtual Cable)" is the standard name but must be verified.
**How to avoid:** Document `ffmpeg.exe -list_devices true -f dshow -i dummy` as the verification step. Consider making device names configurable in `config.json`.
**Warning signs:** ffmpeg.exe subprocess exits immediately with exit code 1; stderr contains "Could not find device".

### Pitfall 3: ffplay.exe `-audio_device_index` is numeric, not named
**What goes wrong:** Can't specify "CABLE Input" by name for output playback; must use the device's numeric index.
**Why it happens:** ffplay uses SDL for audio output, not dshow. SDL requires a numeric index, not a device name string.
**How to avoid:** Add a utility command to list device indices: `ffplay.exe -f lavfi -i anullsrc -list_devices true`. Document the expected index in setup guide. Make the index configurable via `config.json`.
**Warning signs:** ffplay exits immediately with "Could not open audio device" or plays to wrong device.

### Pitfall 4: Raw PCM vs. framed PCM confusion
**What goes wrong:** Relay writes 4-byte length header + PCM payload to ffplay stdin; ffplay produces garbled audio.
**Why it happens:** ffplay expects raw PCM bytes at stdin. The relay's TCP framing is an internal relay protocol — bridges speak raw PCM, TCP clients speak framed PCM.
**How to avoid:** Keep clear separation: TCP sockets ↔ `writeFrame()`/`FrameReader`. Bridge stdin/stdout ↔ raw Buffer chunks directly.
**Warning signs:** Audio sounds like static/noise at output; capture audio appears distorted.

### Pitfall 5: WSL2 interop not available in all spawn contexts
**What goes wrong:** Spawning `ffmpeg.exe` from a WSL2 child process fails with "Exec format error" or "spawn ENOENT".
**Why it happens:** WSL2 interop requires the `$WSL_INTEROP` environment variable; processes spawned without inheriting the parent environment may not have it.
**How to avoid:** When spawning bridge processes, pass `{ env: process.env }` explicitly to child_process.spawn() to ensure environment inheritance. Running via `npm run dev` from a shell that has WSL_INTEROP set should work correctly.
**Warning signs:** "exec format error" or "spawn ENOENT" when trying to spawn `.exe` files.

### Pitfall 6: Capture audio split — operator monitoring requires manual Windows setup
**What goes wrong:** When Chrome routes Meet audio to CABLE Input, the operator can no longer hear it through speakers.
**Why it happens:** VB-Cable routes audio exclusively to its virtual cable — it does not automatically split to physical speakers.
**How to avoid:** Document the one-time Windows setup: In Windows Sound settings, go to Recording devices → right-click "CABLE Output" → Properties → Listen tab → check "Listen to this device" → select operator's speakers/headphones. This mirrors CABLE Output audio to speakers while still allowing ffmpeg.exe to capture it. This is a manual setup step, not something the bridge code controls.
**Warning signs:** Operator cannot hear Meet participants even though capture is working.

### Pitfall 7: Nagle's algorithm adding latency
**What goes wrong:** Small PCM chunks (10-20ms of audio) are batched by the OS before being sent, adding 40-200ms of hidden latency.
**Why it happens:** Nagle's algorithm is enabled by default on TCP sockets to optimize throughput.
**How to avoid:** Call `socket.setNoDelay(true)` on every socket (both the server-side accepted sockets and the `net.Server` itself via `{ noDelay: true }` option).
**Warning signs:** Audio arrives in bursts rather than smooth; measured round-trip exceeds 50ms threshold.

---

## Code Examples

Verified patterns from official sources:

### TCP Server with noDelay
```typescript
// Source: nodejs.org/api/net.html
import { createServer } from 'net';

const server = createServer({ noDelay: true }, (socket) => {
  socket.setNoDelay(true);  // belt and suspenders
  // handle connection
});
server.listen(RELAY_PORT, '127.0.0.1');
```

### ffmpeg.exe Capture Bridge Command
```bash
# Source: ffmpeg.org/ffmpeg-devices.html (dshow) + wlcx.cc low-latency streaming article
# Capture from VB-Cable CABLE Output, output 16kHz mono PCM to stdout
ffmpeg.exe -f dshow -audio_buffer_size 50 \
  -i "audio=CABLE Output (VB-Audio Virtual Cable)" \
  -f s16le -ar 16000 -ac 1 \
  pipe:1

# List available dshow devices (run in PowerShell or cmd.exe):
ffmpeg.exe -list_devices true -f dshow -i dummy
```

### ffplay.exe Output Bridge Command
```bash
# Source: ffplay documentation + usercomp.com article on -audio_device_index
# Play raw PCM from stdin to VB-Cable CABLE Input (device index must be found)
ffplay.exe -f s16le -ar 16000 -ac 1 \
  -audio_device_index 2 \
  -nodisp \
  -i pipe:0

# List available audio output devices (check SDL device list):
# ffplay.exe -f lavfi -i anullsrc -audio_device_index 999  (will fail but print device list)
```

### Relay Data Flow (Capture Direction)
```typescript
// Bridge stdout → raw PCM chunks → relay → framed TCP → capture client
captureProc.stdout!.on('data', (pcm: Buffer) => {
  if (captureClient && !captureClient.destroyed) {
    writeFrame(captureClient, pcm);  // add 4-byte length prefix
  }
});
```

### Relay Data Flow (Output Direction)
```typescript
// Output client → framed TCP → relay strips frame → raw PCM → bridge stdin
const outputReader = new FrameReader();
outputClient.on('data', (data: Buffer) => {
  const frames = outputReader.feed(data);
  for (const frame of frames) {
    // frame is already the raw PCM payload (FrameReader strips the length header)
    outputProc!.stdin!.write(frame);
  }
});
```

### Startup Ordering in main()
```typescript
// In src/index.ts — relay must start BEFORE audio clients
if (platform === 'wsl2') {
  relayServer = new WslAudioRelayServer(config);
  await relayServer.start();  // Promise resolves when TCP server is listening
}
// THEN: createAudioCapture() / createAudioOutput() (which connect to relay)
capture = createAudioCapture(status.audioSinkName, platform);
output = createAudioOutput(status.audioMicName, platform);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Virtual audio cable separate driver install | VB-Cable free driver (project already uses this) | ~2015 | Stable, simple — no change needed |
| dshow-only Windows audio | Both dshow (capture) and WASAPI (playback via SDL/ffplay) | Ongoing | ffplay uses WASAPI by default; `-audio_device_index` selects device |
| Polling for socket availability | Promise-based `server.listen()` callback | Node.js v8+ | Clean async startup pattern |

**Deprecated/outdated:**
- Using `virtual-audio-capturer` dshow filter: it's from 2012 and uses DirectShow — ffmpeg's native `-f dshow` is the correct modern approach
- Stereo Mix for loopback capture: unreliable (disabled by default, driver-dependent) — CABLE Output via VB-Cable is the recommended approach

---

## Open Questions

1. **ffplay.exe `-audio_device_index` for CABLE Input**
   - What we know: `-audio_device_index N` selects the output device; `N` is system-specific
   - What's unclear: The exact index for CABLE Input varies by machine; there is no stable way to look it up programmatically without running ffplay.exe itself
   - Recommendation: Make `outputDeviceIndex` configurable in `config.json` with a sensible default (1 or 2). Document how to find it: run `ffplay.exe -f lavfi -i anullsrc -audio_device_index 999` and read the error output listing available devices.

2. **ffmpeg.exe dshow capture — does it require Chrome's CABLE Input to be the default playback device?**
   - What we know: Chrome routes Meet audio to whichever device it's configured to use. For the relay to capture it, Chrome must be outputting to CABLE Input, and ffmpeg captures from CABLE Output.
   - What's unclear: Does Chrome need CABLE Input set as the *system default*, or can Chrome be configured per-site?
   - Recommendation: Document in setup guide that CABLE Input must be selected in Chrome's Meet settings (per-meeting, not system default), which is the least disruptive approach for the operator.

3. **Bridge process stdin/stdout on Windows when spawned via WSL2 interop**
   - What we know: WSL2 interop routes stdin/stdout back through the interop bridge to the Node.js process
   - What's unclear: Whether high-throughput stdout (16kHz audio ~32KB/s) through the WSL2 interop bridge introduces latency or buffering
   - Recommendation: Build with this approach first. Measure round-trip latency empirically. If interop overhead is measurable, consider a TCP sub-connection (relay connects back to a Windows TCP server) as a fallback — but this adds complexity not warranted until measured.

4. **Capture bridge chunking — frame size and PCM chunk boundaries**
   - What we know: ffmpeg.exe will write PCM chunks of variable size to stdout; the relay wraps each chunk in a length-prefixed frame
   - What's unclear: ffmpeg's stdout chunk sizes may be large (e.g., 4096 bytes) vs. the AI pipeline's preferred 20ms frames (~640 bytes at 16kHz)
   - Recommendation: The relay should pass through whatever chunk sizes come from ffmpeg without rechunking — the AI session (`GeminiLiveSession`) should tolerate variable chunk sizes. If rechunking is needed, add it to the capture client, not the relay.

---

## Validation Architecture

> `workflow.nyquist_validation` is not in `.planning/config.json` — skip this section.

(The config.json contains `workflow.research`, `workflow.plan_check`, `workflow.verifier`, `workflow.auto_advance` but not `nyquist_validation`. Treating as false/absent.)

---

## Sources

### Primary (HIGH confidence)
- `nodejs.org/api/net.html` — TCP server, `noDelay`, socket options, `server.listen()` Promise pattern
- `ffmpeg.org/ffmpeg-devices.html` — dshow input device, `audio_buffer_size`, device listing
- Existing codebase (`src/audio/wsl2-relay.ts`, `wsl2-capture.ts`, `wsl2-output.ts`, `src/index.ts`, `src/video/native-feed.ts`) — FIXED framing protocol, existing patterns to match

### Secondary (MEDIUM confidence)
- `wlcx.cc/blog/streaming-low-latency-windows-audio/` — `-audio_buffer_size 50` for dshow low-latency, `-f s16le` PCM pipe pattern
- `usercomp.com/news/1423102/set-ffplay-audio-output-on-windows` — ffplay `-audio_device_index` for output device selection
- `wsl.dev/technical-documentation/interop/` — WSL2 binfmt interop mechanism for spawning Windows .exe
- `vb-audio.com/Cable/` + forum posts — "Listen to this device" for CABLE Output as the split/mirror approach

### Tertiary (LOW confidence)
- ffplay `-f lavfi -i anullsrc -audio_device_index 999` for device enumeration: inferred from error output pattern, not directly documented

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — node:net, node:child_process, ffmpeg dshow are well-documented; no new npm packages
- Architecture: HIGH — relay is pure byte-forwarding; framing protocol is fixed by existing code
- Windows bridge commands: MEDIUM — dshow capture command pattern is confirmed; ffplay stdin input + device index is documented but device index discovery is system-specific
- WSL2 interop spawning: MEDIUM — mechanism is documented; high-throughput pipe performance through interop bridge is unverified
- Operator audio split: MEDIUM — "Listen to this device" approach is confirmed via VB-Audio forum; works but is manual setup

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable tech — Node.js net module, ffmpeg dshow are not fast-moving)
