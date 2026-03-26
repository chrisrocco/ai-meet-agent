# Phase 3: Static Video Feed - Research

**Researched:** 2026-03-25
**Domain:** ffmpeg subprocess management, v4l2 image streaming, WSL2→Windows video bridge
**Confidence:** HIGH (native Linux) / MEDIUM (WSL2 bridge)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Placeholder image**: Bundled default (professional silhouette/abstract pattern); user-configurable via `devices.camera.imagePath` in config; falls back to bundled default
- **Resolution**: 1280x720 (720p); non-16:9 sources padded with black bars (scale-to-fit, no distortion)
- **Frame rate**: 15fps (sufficient for static, prevents Meet "frozen" indicator, half CPU of 30fps)
- **Feed stability**: Auto-restart on ffmpeg crash (detect exit, restart after short delay, emit event); health monitoring by exit event only (no polling)
- **Process group kill**: Spawn ffmpeg in new process group; kill group on shutdown to prevent zombies
- **WSL2 path**: Launch ffmpeg.exe via powershell.exe from WSL2, reads image from Windows-accessible path, outputs to OBS Virtual Camera
- **WSL2 OBS docs**: Include installation + virtual camera plugin configuration in WSL2 docs
- **Interface shape**: `VideoFeed` interface with `start(imagePath)/stop()`, factory `createVideoFeed()` picks `NativeVideoFeed` (v4l2) or `Wsl2VideoFeed`; matches audio module pattern

### Claude's Discretion
- Default placeholder image design/generation approach
- ffmpeg arguments for image-to-video conversion
- Restart delay timing
- Process group implementation details
- OBS virtual camera configuration specifics

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VDEV-03 | Static placeholder image fed through virtual camera as video stream | ffmpeg `-loop 1 -re` image streaming to v4l2 (native) or HTTP MJPEG (WSL2 → OBS); VideoFeed interface + factory; auto-restart; config extension |
</phase_requirements>

---

## Summary

Phase 3 streams a static JPEG through virtual camera infrastructure so Google Meet sees a connected webcam. The native Linux path is well-understood: ffmpeg with `-loop 1 -re` feeds a JPEG to a v4l2loopback device at 15fps, padded to 16:9. The auto-restart and factory patterns are directly inherited from the existing `NativeAudioCapture` and audio factory implementations.

The WSL2 path is the primary design challenge. v4l2loopback is absent from the WSL2 kernel (confirmed in Phase 1), so the video feed must route through OBS Virtual Camera on Windows. The practical approach: `Wsl2VideoFeed` spawns `powershell.exe` (which runs `ffmpeg.exe` on Windows), ffmpeg outputs an MJPEG stream to stdout, and a Node.js HTTP server in WSL2 serves that stream. OBS on Windows (already in the bridge setup) connects to `http://localhost:PORT/feed` as a Media Source → OBS Virtual Camera → Chrome. Windows `localhost` transparently routes to WSL2 (confirmed by the audio TCP relay precedent).

No new npm packages are needed. `fluent-ffmpeg` is already in `package.json` dependencies but the codebase uses raw `spawn` throughout — maintain that pattern for consistency. The WSL2 path needs a process-tree kill via `taskkill /F /T` (not just SIGTERM) to reliably terminate Windows-side ffmpeg.exe.

**Primary recommendation:** Follow the NativeAudioCapture restart pattern, use raw `spawn` for ffmpeg subprocess management, and implement the WSL2 bridge as an HTTP MJPEG server served from WSL2 Node.js.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ffmpeg | system | Image→video encoding, v4l2 output | Already used in VirtualCamera; system binary |
| ffmpeg.exe (Windows) | system | Windows-side image encoding for OBS | Same binary, Windows path; expected by WSL2 bridge docs |
| Node.js `child_process` | built-in | Subprocess spawning | Used by all existing audio/camera classes |
| Node.js `http` | built-in | WSL2 MJPEG HTTP server for OBS | No new dependencies; same localhost bridge as audio relay |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `fluent-ffmpeg` | ^2.1.3 | Already in package.json | Skip — raw spawn is the established pattern |
| `zod` | ^3.23.8 | Config schema extension | Already used; add `devices.camera.imagePath` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw spawn | fluent-ffmpeg | fluent-ffmpeg adds abstraction but breaks pattern consistency; raw spawn used by all existing code |
| HTTP MJPEG (WSL2) | RTSP | RTSP requires a separate server process (mediamtx/rtsp-simple-server); HTTP MJPEG works with Node.js built-in `http` |
| HTTP MJPEG (WSL2) | Named pipe | Named pipes on Windows are complex; HTTP over localhost already proven by audio relay |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── video/
│   ├── types.ts          # VideoFeed interface + events
│   ├── native-feed.ts    # NativeVideoFeed (v4l2)
│   ├── wsl2-feed.ts      # Wsl2VideoFeed (HTTP MJPEG → OBS)
│   ├── factory.ts        # createVideoFeed() — platform DI
│   ├── index.ts          # Public exports
│   └── assets/
│       └── placeholder.jpg   # Bundled default (committed to repo)
```

### Pattern 1: VideoFeed Interface (mirrors AudioCapture)
**What:** EventEmitter with `start(imagePath)/stop()`. Emits `'restarting'` and `'error'` events.
**When to use:** Both native and WSL2 implementations implement this.

```typescript
// src/video/types.ts
import { EventEmitter } from 'events';

/**
 * Video feed interface — streams a static image to the virtual camera.
 *
 * Events:
 * - 'restarting': ffmpeg exited unexpectedly, restarting
 * - 'error': Fatal error (Error payload)
 */
export interface VideoFeed extends EventEmitter {
  start(imagePath: string): void;
  stop(): void;
}
```

### Pattern 2: NativeVideoFeed — raw spawn with process group + auto-restart
**What:** Spawns ffmpeg with `detached: true` (new process group). On unexpected exit, restarts after 1 second.
**When to use:** Native Linux only (`platform === 'native-linux'`).

```typescript
// src/video/native-feed.ts (pattern — based on NativeAudioCapture)
import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export class NativeVideoFeed extends EventEmitter implements VideoFeed {
  private proc: ChildProcess | null = null;
  private stopped = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly devicePath: string;

  constructor(videoNr: number) {
    super();
    this.devicePath = `/dev/video${videoNr}`;
  }

  start(imagePath: string): void {
    this.stopped = false;
    this.spawnFfmpeg(imagePath);
  }

  stop(): void {
    this.stopped = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.killProc();
  }

  private spawnFfmpeg(imagePath: string): void {
    this.proc = spawn(
      'ffmpeg',
      [
        '-loop', '1',          // Loop static image input indefinitely
        '-re',                 // Throttle to real-time (prevents CPU burn)
        '-i', imagePath,
        '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1',
        '-pix_fmt', 'yuv420p', // Required for v4l2 compatibility
        '-f', 'v4l2',
        '-r', '15',
        this.devicePath,
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,        // New process group for group kill
      }
    );

    this.proc.on('error', (err) => this.emit('error', err));
    this.proc.on('exit', (code, signal) => {
      if (!this.stopped) {
        this.emit('restarting');
        this.restartTimer = setTimeout(() => this.spawnFfmpeg(imagePath), 1000);
      }
      this.proc = null;
    });
  }

  private killProc(): void {
    if (this.proc?.pid) {
      try {
        process.kill(-this.proc.pid, 'SIGTERM'); // Kill process group
      } catch { /* already dead */ }
      this.proc = null;
    }
  }
}
```

### Pattern 3: Wsl2VideoFeed — powershell.exe + HTTP MJPEG server
**What:** Spawns `powershell.exe` with `ffmpeg.exe -f mpjpeg pipe:1`, serves MJPEG over HTTP.
**When to use:** WSL2 platform only.

```typescript
// src/video/wsl2-feed.ts (pattern)
import { spawn, execSync, type ChildProcess } from 'child_process';
import { createServer, type Server } from 'http';
import { EventEmitter } from 'events';

const BOUNDARY = 'aiMeetFrame';

export class Wsl2VideoFeed extends EventEmitter implements VideoFeed {
  private proc: ChildProcess | null = null;
  private server: Server | null = null;
  private stopped = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly port: number;

  constructor(port = 8085) {
    super();
    this.port = port;
  }

  start(imagePath: string): void {
    this.stopped = false;
    this.startHttpServer();
    this.spawnFfmpeg(imagePath);
  }

  stop(): void {
    this.stopped = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.killProc();
    this.server?.close();
    this.server = null;
  }

  private toWindowsPath(wslPath: string): string {
    return execSync(`wslpath -w "${wslPath}"`).toString().trim();
  }

  private spawnFfmpeg(imagePath: string): void {
    const winPath = this.toWindowsPath(imagePath);
    const ffmpegArgs = [
      '-loop', '1', '-re',
      '-i', winPath,
      '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1',
      '-f', 'mpjpeg',        // Output MJPEG frames to stdout
      `-mpjpeg_boundary_tag`, BOUNDARY,
      '-r', '15',
      'pipe:1',
    ].join(' ');

    this.proc = spawn('powershell.exe', ['-Command', `ffmpeg.exe ${ffmpegArgs}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.proc.on('error', (err) => this.emit('error', err));
    this.proc.on('exit', (code, signal) => {
      if (!this.stopped) {
        this.emit('restarting');
        this.restartTimer = setTimeout(() => this.spawnFfmpeg(imagePath), 1000);
      }
      this.proc = null;
    });
  }

  private startHttpServer(): void {
    this.server = createServer((req, res) => {
      res.writeHead(200, {
        'Content-Type': `multipart/x-mixed-replace; boundary=${BOUNDARY}`,
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      // Pipe ffmpeg stdout directly — it already outputs MJPEG multipart format
      if (this.proc?.stdout) {
        this.proc.stdout.pipe(res, { end: false });
      }
    });
    this.server.listen(this.port, '0.0.0.0');
  }

  private killProc(): void {
    if (this.proc?.pid) {
      // taskkill /T terminates the Windows process tree (kills ffmpeg.exe child)
      try {
        spawn('powershell.exe', ['-Command', `taskkill /F /T /PID ${this.proc.pid}`]);
      } catch { /* ignore */ }
      this.proc = null;
    }
  }
}
```

### Pattern 4: Factory — mirrors audio factory exactly
```typescript
// src/video/factory.ts
import { detectPlatform, type Platform } from '../platform/detect.js';
import { NativeVideoFeed } from './native-feed.js';
import { Wsl2VideoFeed } from './wsl2-feed.js';
import type { VideoFeed } from './types.js';

export function createVideoFeed(videoNr: number, platform?: Platform): VideoFeed {
  const p = platform ?? detectPlatform();
  if (p === 'wsl2') {
    return new Wsl2VideoFeed();
  }
  return new NativeVideoFeed(videoNr);
}
```

### Pattern 5: Config schema extension
```typescript
// src/config/schema.ts — add imagePath to camera object
camera: z.object({
  label: z.string().default('AI Meet Agent Camera'),
  videoNr: z.number().int().min(0).max(63).default(10),
  imagePath: z.string().optional(),  // Falls back to bundled default if not set
}).default({}),
```

### Pattern 6: ESM asset path resolution (bundled default image)
```typescript
// src/video/native-feed.ts (or a shared helper)
import { fileURLToPath } from 'url';

export const DEFAULT_PLACEHOLDER_PATH = fileURLToPath(
  new URL('./assets/placeholder.jpg', import.meta.url)
);
```

**Build note**: `tsc` does not copy non-TS files. Add to `package.json`:
```json
"postbuild": "cp -r src/video/assets dist/video/ 2>/dev/null || true"
```
Under `tsx` (dev), `import.meta.url` resolves to `src/video/` so no copy needed.

### Pattern 7: DeviceManager integration
Replace `startTestPattern?: boolean` option with image feed startup. The video feed starts alongside audio in `main()`, not inside `DeviceManager.startup()`, so it follows the same pattern as `createAudioCapture()` in `src/index.ts`.

**On WSL2**: `Wsl2VideoFeed.start()` needs to run but OBS integration requires manual one-time setup. Log the OBS Media Source URL (`http://localhost:8085/feed`) to console.

### Anti-Patterns to Avoid
- **Starting the feed inside `DeviceManager.startup()`**: DeviceManager is synchronous; keep video feed lifecycle in `main()` alongside audio, so shutdown handlers can stop it cleanly.
- **Using `-framerate` instead of `-r`**: `-framerate` is an input option; `-r` is the output frame rate option for the v4l2 sink. Using `-framerate` on output causes undefined behavior.
- **Piping stdout to all HTTP clients simultaneously**: The MJPEG server should handle multiple connections gracefully. The code example above naively pipes to first client only — implementation should track active responses.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Image scaling/padding | Custom image resizer | ffmpeg `-vf scale+pad` filter chain | ffmpeg handles all pixel formats, edge cases, and aspect ratios |
| JPEG frame splitting from MJPEG stream | Custom frame parser | ffmpeg `-f mpjpeg -mpjpeg_boundary_tag` | ffmpeg outputs well-formed MJPEG with consistent boundaries |
| RTSP server | Custom media server | (Avoid RTSP) Use HTTP MJPEG | HTTP MJPEG works with Node.js built-in `http`; RTSP needs external server |
| Windows path conversion | Manual string replace | `wslpath -w` shell command | handles edge cases (spaces, symlinks, drive letters, WSL distro names) |

**Key insight:** ffmpeg's `-f mpjpeg pipe:1` outputs a standards-compliant multipart MIME stream that Node.js can pipe directly to HTTP responses — no custom frame packetization needed.

---

## Common Pitfalls

### Pitfall 1: ffmpeg exits immediately on static image without `-loop 1`
**What goes wrong:** Without `-loop 1`, ffmpeg reads one frame from the JPEG and terminates immediately. The v4l2 device shows a single frame then goes black.
**Why it happens:** Images have no natural duration. ffmpeg treats EOF immediately.
**How to avoid:** Always use `-loop 1` for JPEG/PNG input when continuous output is needed.
**Warning signs:** ffmpeg exits with code 0 within milliseconds of start.

### Pitfall 2: yuv420p required for v4l2
**What goes wrong:** ffmpeg errors: `The pixel format 'yuvj444p' is not supported` or similar. Chrome/Meet can't open the device.
**Why it happens:** v4l2loopback typically requires YUV420 planar format; ffmpeg's JPEG decoder defaults to yuvj422p.
**How to avoid:** Always specify `-pix_fmt yuv420p` in the output args.

### Pitfall 3: Process group kill required for zombie prevention
**What goes wrong:** On SIGTERM to main process, ffmpeg subprocess keeps running, blocking the v4l2 device for next run.
**Why it happens:** `child.kill('SIGTERM')` kills only the direct child; detached ffmpeg with its own process group ignores parent's death.
**How to avoid:** `detached: true` + `process.kill(-pid, 'SIGTERM')` kills the entire group.
**Warning signs:** Restart fails with `Device or resource busy` on `/dev/videoN`.

### Pitfall 4: `wslpath -w` output includes trailing newline
**What goes wrong:** ffmpeg.exe can't find the file — path has `\r\n` at end.
**Why it happens:** `execSync().toString()` includes newline.
**How to avoid:** Always `.trim()` the `wslpath -w` output.

### Pitfall 5: MJPEG HTTP server only serves first client
**What goes wrong:** If OBS reconnects (e.g., after restart), the new HTTP connection gets no data because `proc.stdout` is already piped to the previous response.
**Why it happens:** Node.js readable streams can only pipe to one destination at a time with `.pipe()`.
**How to avoid:** Use a writable broadcast pattern (track active `res` objects, write to all) instead of `.pipe()`.

### Pitfall 6: ffmpeg.exe path not in Windows PATH when spawned from WSL2
**What goes wrong:** `powershell.exe -Command "ffmpeg.exe ..."` fails: `ffmpeg.exe is not recognized`.
**Why it happens:** PATH inside the `powershell.exe` spawned from WSL2 may differ from interactive PATH.
**How to avoid:** Require user to add ffmpeg to Windows `$env:PATH` during setup. Document this in `docs/wsl2-setup.md`. Consider detecting and emitting a helpful error message if ffmpeg.exe spawn fails.

### Pitfall 7: `mpjpeg_boundary_tag` ffmpeg option may not exist in all versions
**What goes wrong:** ffmpeg outputs default boundary (`--ffserver_snapshot.XXXXXXXX` with random suffix) making it hard to set correct `Content-Type` header.
**Why it happens:** Boundary tag was not always user-configurable.
**How to avoid:** Use a known ffmpeg version that supports `-mpjpeg_boundary_tag`. Alternative: read the first few bytes of stdout to extract the boundary before starting HTTP server. MEDIUM confidence on this flag.

---

## Code Examples

### ffmpeg args for static image → v4l2 (verified pattern)
```bash
# Native Linux: static JPEG → v4l2loopback at 15fps, padded to 1280x720
ffmpeg \
  -loop 1 \
  -re \
  -i /path/to/image.jpg \
  -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1" \
  -pix_fmt yuv420p \
  -f v4l2 \
  -r 15 \
  /dev/video10
```

### ffmpeg args for static image → MJPEG stdout (WSL2 Windows side)
```powershell
# Run by powershell.exe spawned from WSL2
ffmpeg.exe `
  -loop 1 -re `
  -i "\\wsl.localhost\Ubuntu\home\chris\image.jpg" `
  -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1" `
  -f mpjpeg `
  -r 15 `
  pipe:1
```

### WSL2 path translation
```typescript
import { execSync } from 'child_process';

function toWindowsPath(wslPath: string): string {
  return execSync(`wslpath -w "${wslPath}"`).toString().trim();
}
// '/home/chris/image.jpg' → '\\wsl.localhost\Ubuntu\home\chris\image.jpg'
```

### Process group kill (native Linux)
```typescript
// detached: true creates new process group with pgid === pid
const proc = spawn('ffmpeg', args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });

// To kill:
if (proc.pid) {
  process.kill(-proc.pid, 'SIGTERM'); // Negative PID = process group
}
```

### Windows process tree kill (WSL2)
```typescript
function killWindowsProcessTree(pid: number): void {
  spawn('powershell.exe', ['-Command', `taskkill /F /T /PID ${pid}`]);
}
```

### Config schema addition
```typescript
// In src/config/schema.ts — extend camera object:
camera: z.object({
  label: z.string().default('AI Meet Agent Camera'),
  videoNr: z.number().int().min(0).max(63).default(10),
  imagePath: z.string().optional(),
}).default({}),
```

### Integration in main() (after existing audio setup)
```typescript
// src/index.ts — after audio setup, mirrors audio pattern:
let videoFeed: VideoFeed | null = null;

try {
  videoFeed = createVideoFeed(config.devices.camera.videoNr, platform);
  const imagePath = config.devices.camera.imagePath ?? DEFAULT_PLACEHOLDER_PATH;
  videoFeed.start(imagePath);
  videoFeed.on('restarting', () => console.log('[VideoFeed] Restarting...'));
  videoFeed.on('error', (err: Error) => console.warn(`[VideoFeed] Error: ${err.message}`));

  if (platform === 'wsl2') {
    console.log('[VideoFeed] MJPEG stream at http://localhost:8085/feed — configure OBS Media Source');
  } else {
    console.log(`[VideoFeed] Static image streaming to ${status.cameraDevice}`);
  }
} catch (err) {
  console.warn(`[VideoFeed] Could not start: ${(err as Error).message}`);
}

// In shutdown handler:
if (videoFeed) {
  try { videoFeed.stop(); } catch { /* ignore */ }
}
```

---

## Open Questions

1. **Does `-mpjpeg_boundary_tag` exist in the installed version of ffmpeg.exe?**
   - What we know: The flag controls the MIME boundary string in `-f mpjpeg` output
   - What's unclear: Version availability; ffmpeg version on user's Windows machine is unknown
   - Recommendation: Check with `ffmpeg.exe -help full | grep mpjpeg_boundary`. Fallback: parse boundary from first stdout bytes.

2. **Can multiple OBS connections receive the MJPEG stream simultaneously?**
   - What we know: `.pipe()` to a single `res` is straightforward; multiple clients need broadcast
   - What's unclear: Whether OBS opens one persistent connection or reconnects frequently
   - Recommendation: Implement simple broadcast (track active responses); test with OBS connect/disconnect.

3. **Does ffmpeg.exe run successfully under powershell.exe spawned from WSL2?**
   - What we know: WSL2 can spawn Windows executables; audio relay uses TCP relay (not powershell spawn) so this path is untested
   - What's unclear: PATH availability, stdout/stderr forwarding fidelity
   - Recommendation: Quick manual test: `node -e "require('child_process').spawn('powershell.exe', ['-Command', 'ffmpeg.exe -version'], {stdio:'inherit'})"` from WSL2.

4. **Does `VirtualCamera.startTestPattern()` need to be removed or preserved?**
   - What we know: `DeviceManager.startup()` has `startTestPattern?: boolean` option currently always called with `false`
   - What's unclear: Whether test pattern is still useful for debugging
   - Recommendation: Keep `VirtualCamera` class as-is for now; the new `NativeVideoFeed` is separate. `DeviceManager.startup()` can drop the `startTestPattern` option in a future cleanup.

---

## Sources

### Primary (HIGH confidence)
- ffmpeg docs — `-loop`, `-re`, `-f v4l2`, `-pix_fmt yuv420p` options confirmed by existing VirtualCamera code in codebase
- Codebase (`src/audio/capture.ts`) — auto-restart pattern with `stopped` flag + `setTimeout(1000)` + `emit('reconnecting')` pattern, confirmed by working Phase 2 implementation
- Codebase (`src/audio/factory.ts`) — factory pattern with platform DI, confirmed working
- Codebase (`src/audio/wsl2-relay.js` TCP bridge) — Windows `localhost` routes to WSL2 in production environment, confirmed working in Phase 2

### Secondary (MEDIUM confidence)
- Node.js `http` module MJPEG server pattern — multipart/x-mixed-replace with boundary is standard HTTP MJPEG spec; widely used by browsers and OBS Media Source
- WSL2 `powershell.exe` spawn from Node.js — documented WSL2 interop capability; not currently used in codebase but standard WSL2 interop
- `wslpath -w` — WSL2 utility for path translation, included in all WSL2 distributions

### Tertiary (LOW confidence)
- `-mpjpeg_boundary_tag` ffmpeg flag — referenced in ffmpeg source; version availability not verified against installed version
- `taskkill /F /T /PID` behavior with WSL2-spawned processes — Windows process tree kill should work; not tested in this specific spawn context

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; uses existing spawn + http patterns
- Native Linux architecture: HIGH — directly mirrors existing audio capture pattern with confirmed ffmpeg v4l2 usage
- WSL2 architecture: MEDIUM — powershell spawn + HTTP MJPEG path is logical but untested in this project
- Pitfalls: HIGH — most are confirmed by existing code patterns (process groups, yuv420p)

**Research date:** 2026-03-25
**Valid until:** 2026-06-25 (stable domain; WSL2 interop specifics change slowly)
