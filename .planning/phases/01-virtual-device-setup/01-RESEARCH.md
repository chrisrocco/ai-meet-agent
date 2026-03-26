# Phase 1: Virtual Device Setup - Research

**Researched:** 2026-03-25
**Domain:** Linux virtual camera (v4l2loopback) and virtual audio (PipeWire/PulseAudio null-sink) device setup, WSL2 kernel module constraints, Chrome getUserMedia enumeration
**Confidence:** MEDIUM overall — core Linux mechanisms are HIGH confidence; WSL2 audio/video device visibility in Chrome is the highest-uncertainty area

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**WSL2 Strategy**
- WSL2 is the primary development environment — user runs Chrome on Windows, dev tools in WSL2
- Native Linux support is also required but WSL2 is day-to-day use
- If WSL2 virtual devices prove too difficult (kernel compilation, broken audio bridges), document limitations and ship native Linux support — don't block the project
- Chrome on Windows cannot see Linux virtual devices directly — this architectural fork must be resolved early
- Fallback: Windows-side bridges (VB-Cable + OBS Virtual Camera) are acceptable if native WSL2 approach fails

**Device Naming**
- Device names should be configurable via config file
- Default names: "AI Meet Agent Camera" and "AI Meet Agent Mic" (or similar branded names)
- Single virtual camera + single virtual mic (plus whatever virtual speaker/sink the audio routing needs)

**Setup Automation**
- Provide both: setup script for convenience + documented manual steps for understanding
- Program checks prerequisites on startup — clear actionable error messages if something is missing
- v4l2loopback module expected to be pre-loaded (setup script handles installation, program doesn't auto-install with sudo)
- Configuration lives in a config file (JSON) in the project directory
- Virtual devices created on program start, cleaned up on exit

**Validation Approach**
- Startup checks verify devices exist and report status in console
- Separate test command (`npm run test-devices` or similar) for standalone verification
- Video test: show a test pattern or placeholder image through virtual camera
- Audio test: play a test tone through virtual mic to confirm the path works
- Errors include actionable fix commands, not just failure messages

### Claude's Discretion
- Exact v4l2loopback parameters (exclusive_caps, video format, FPS for test)
- PipeWire vs PulseAudio module choice for virtual audio devices
- Config file schema design
- Setup script implementation details
- Whether to use DKMS package or compile v4l2loopback from source

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VDEV-01 | Virtual camera device appears as selectable webcam in Chrome | v4l2loopback with `exclusive_caps=1` + `card_label` is the mechanism; Chrome on WSL2 is the hard case requiring architecture decision |
| VDEV-02 | Virtual microphone device appears as selectable mic in Chrome | PipeWire `module-null-sink` with `media.class=Audio/Source/Virtual` is the mechanism on native Linux; WSL2 uses PulseAudio via WSLg RDP audio — virtual sinks disappear after ~2 min unless properly persisted |
| PLAT-01 | Works on Linux (native) with PulseAudio/PipeWire and v4l2loopback | Standard DKMS install + pactl commands work reliably on native Linux |
| PLAT-02 | Works on Linux (WSL2) with appropriate device routing | Requires concrete architecture decision: WSLg-with-Chrome-inside-WSL2 vs. Windows-Chrome-with-VB-Cable-bridge; research shows neither path is trivial |
</phase_requirements>

---

## Summary

Phase 1 is fundamentally a Linux device plumbing phase: create a virtual camera device that Chrome enumerates as a real webcam, and a virtual microphone that Chrome enumerates as a real input device. On native Linux, both operations are well-understood and work reliably. The entire complexity of this phase lives in the WSL2 path.

The critical architectural decision — which Chrome environment is the target — must be resolved at the start of the phase, not discovered mid-implementation. Research confirms that Chrome on Windows cannot see Linux `/dev/videoN` devices at all, and Chrome on Windows uses Windows audio (WASAPI), not PulseAudio sinks. This means the WSL2 path requires either (a) running Chrome inside WSL2 via WSLg and somehow getting virtual devices visible there, or (b) using Windows-side tools (OBS Virtual Camera + VB-Cable) that Chrome on Windows natively sees. Both paths have documented difficulties.

WSLg uses PulseAudio (not PipeWire) for its audio transport over RDP. Ubuntu 22.04+ defaults to PipeWire, which conflicts with WSLg's PulseAudio. Users report that pactl null-sink modules loaded inside WSLg disappear after approximately 2 minutes, an active open issue with no resolution. v4l2loopback on WSL2 requires custom kernel compilation against Microsoft's WSL2 kernel headers — the standard `apt install v4l2loopback-dkms` + `modprobe` will fail because WSL2's kernel does not ship with the module.

**Primary recommendation:** Implement native Linux support first (clean, well-understood). Add WSL2 as a separately documented path. For WSL2, probe both sub-paths in a research spike at the start of the phase: (1) Chrome inside WSL2 via WSLg + v4l2loopback from custom kernel, and (2) Windows Chrome + OBS Virtual Camera + VB-Cable fallback. Document whichever actually works and ship it.

---

## Standard Stack

### Core (Native Linux)

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| `v4l2loopback` (kernel module) | 0.12.7 (Ubuntu 22.04 DKMS) | Creates `/dev/videoN` that Chrome sees as webcam | The canonical Linux virtual camera kernel module, used by OBS, ManyCam, every virtual camera product. No alternative exists for kernel-level V4L2 device. |
| `v4l2loopback-dkms` | 0.12.7-2ubuntu2~22.04.1 | Rebuilds module automatically on kernel upgrades | DKMS is the right packaging approach — avoids manual recompile on `apt upgrade`. Source compile only needed for WSL2. |
| `ffmpeg` (system binary) | 6.x (Ubuntu 22.04+) | Write video frames / test patterns to v4l2loopback device | Stable and mature. Handles pixel format conversion (`yuv420p`), maintains consistent frame rate. The simplest approach for feeding static images or test patterns. |
| PipeWire + `pipewire-pulse` | 0.3.x (Ubuntu 22.04+) | Audio server; creates virtual audio nodes | Ships as default on Ubuntu 22.04+. PulseAudio commands work via compatibility layer (`pipewire-pulse`). |
| `pactl` (system binary) | part of PulseAudio utils | Load virtual audio modules at runtime | Standard tool for dynamic PulseAudio/PipeWire module management. Works identically on both PulseAudio and PipeWire+pipewire-pulse. |

### Node.js Layer

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| Node.js built-in `child_process` | Node 22 built-in | Spawn `modprobe`, `pactl`, `ffmpeg` subprocesses | No dependency needed. `execSync` for one-shot checks, `spawn` with stdio pipe for ffmpeg video feed process. |
| `fluent-ffmpeg` | `^2.1.x` | Wrap ffmpeg subprocess for video test feed | Cleaner API than raw spawn for composing ffmpeg arguments. Optional — can use `child_process.spawn` directly if fluent-ffmpeg's v4l2 output mode has issues. |
| `zod` | `^3.x` | Validate config file JSON at startup | Catches malformed config with clear error messages at startup rather than cryptic runtime failures. |

### Supporting (WSL2 Windows-side fallback only)

| Tool | Platform | Purpose | Notes |
|------|----------|---------|-------|
| OBS Studio + Virtual Camera plugin | Windows | Presents a Windows camera device Chrome can see | OBS must be running; user launches before starting agent. Heavy but functional. |
| VB-Cable (VB-Audio) | Windows | Virtual audio cable Chrome sees as Windows audio input | Free; installs as Windows audio device. Chrome on Windows sees it natively via WASAPI. |

### Alternatives Considered

| Instead of | Could Use | Why Not |
|------------|-----------|---------|
| DKMS package | Compile v4l2loopback from source | DKMS is easier to maintain; source compile only needed on WSL2 where DKMS package won't load |
| ffmpeg subprocess | Direct V4L2 ioctl from Node.js | V4L2 ioctl API is complex; ffmpeg handles pixel format quirks reliably |
| PipeWire null-sink | ALSA `snd-aloop` | ALSA devices not visible to browsers via getUserMedia; snd-aloop requires kernel module (fails on WSL2 same as v4l2loopback) |
| PipeWire null-sink | PulseAudio-only null-sink | Commands are identical; PipeWire with pipewire-pulse is the current standard on Ubuntu 22.04+; use PipeWire and the same pactl commands work |
| `module-null-sink` monitor | `module-remap-source` | Some browsers filter "monitor" sources from mic list; remap-source creates a non-monitor source Chrome will show. Use remap-source for the virtual mic. |

**Installation (native Linux):**
```bash
# System packages
sudo apt-get install v4l2loopback-dkms v4l2loopback-utils ffmpeg pipewire pipewire-pulse wireplumber

# Load virtual camera (run once, or on program startup after prerequisites checked)
sudo modprobe v4l2loopback video_nr=10 card_label="AI Meet Agent Camera" exclusive_caps=1

# Create virtual audio sink (for feeding AI audio out to Chrome)
pactl load-module module-null-sink sink_name=ai_meet_sink sink_properties=device.description="AI Meet Agent Sink"

# Create virtual microphone (Chrome will see this as an input)
pactl load-module module-null-sink media.class=Audio/Source/Virtual sink_name=ai_meet_mic sink_properties=device.description="AI Meet Agent Mic"

# Node.js packages
npm install fluent-ffmpeg zod
npm install -D @types/fluent-ffmpeg
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── config/
│   ├── schema.ts          # Zod schema for config.json validation
│   └── loader.ts          # Load and validate config from project root
├── devices/
│   ├── prerequisites.ts   # Check: v4l2loopback loaded, PipeWire running
│   ├── virtual-camera.ts  # modprobe check, ffmpeg test pattern feed
│   ├── virtual-audio.ts   # pactl module load/unload, virtual sink/mic
│   └── index.ts           # DeviceManager: create(), cleanup(), status()
├── platform/
│   ├── detect.ts          # Detect: native Linux vs WSL2, audio system type
│   └── wsl2.ts            # WSL2-specific device handling (VB-Cable path)
scripts/
├── setup.sh               # One-time setup: apt install, modprobe persisted
├── test-devices.sh         # Standalone device validation (called by npm run test-devices)
config.json                # User-facing config (device names, video_nr, etc.)
```

### Pattern 1: Prerequisite Check with Actionable Errors

Before any device creation, check prerequisites and fail fast with runnable fix commands.

```typescript
// src/devices/prerequisites.ts
import { execSync } from 'child_process';

interface PrereqResult {
  ok: boolean;
  checks: { name: string; ok: boolean; fix?: string }[];
}

export function checkPrerequisites(): PrereqResult {
  const checks = [];

  // Check v4l2loopback loaded
  try {
    execSync('lsmod | grep v4l2loopback', { stdio: 'pipe' });
    checks.push({ name: 'v4l2loopback kernel module', ok: true });
  } catch {
    checks.push({
      name: 'v4l2loopback kernel module',
      ok: false,
      fix: 'sudo modprobe v4l2loopback video_nr=10 card_label="AI Meet Agent Camera" exclusive_caps=1',
    });
  }

  // Check PipeWire/PulseAudio running
  try {
    execSync('pactl info', { stdio: 'pipe' });
    checks.push({ name: 'PipeWire/PulseAudio', ok: true });
  } catch {
    checks.push({
      name: 'PipeWire/PulseAudio',
      ok: false,
      fix: 'systemctl --user start pipewire pipewire-pulse',
    });
  }

  // Check /dev/video10 exists (or configured device)
  try {
    execSync('ls /dev/video10', { stdio: 'pipe' });
    checks.push({ name: '/dev/video10 exists', ok: true });
  } catch {
    checks.push({
      name: '/dev/video10 exists',
      ok: false,
      fix: 'sudo modprobe v4l2loopback video_nr=10 card_label="AI Meet Agent Camera" exclusive_caps=1',
    });
  }

  return {
    ok: checks.every(c => c.ok),
    checks,
  };
}
```

### Pattern 2: Virtual Audio Device Lifecycle

Create on start, clean up on exit — pactl modules are runtime state, not persistent.

```typescript
// src/devices/virtual-audio.ts
import { execSync } from 'child_process';

export class VirtualAudioDevices {
  private sinkModuleId: number | null = null;
  private micModuleId: number | null = null;

  create(sinkName: string, micName: string, sinkLabel: string, micLabel: string): void {
    // Create the output sink (AI audio goes here to reach Chrome's audio output)
    const sinkOutput = execSync(
      `pactl load-module module-null-sink sink_name="${sinkName}" sink_properties=device.description="${sinkLabel}"`,
      { encoding: 'utf8' }
    ).trim();
    this.sinkModuleId = parseInt(sinkOutput, 10);

    // Create virtual microphone (Chrome sees this as a mic input)
    // Use Audio/Source/Virtual so it appears as a source, not just a monitor
    const micOutput = execSync(
      `pactl load-module module-null-sink media.class=Audio/Source/Virtual sink_name="${micName}" sink_properties=device.description="${micLabel}"`,
      { encoding: 'utf8' }
    ).trim();
    this.micModuleId = parseInt(micOutput, 10);
  }

  cleanup(): void {
    if (this.micModuleId !== null) {
      try { execSync(`pactl unload-module ${this.micModuleId}`); } catch {}
      this.micModuleId = null;
    }
    if (this.sinkModuleId !== null) {
      try { execSync(`pactl unload-module ${this.sinkModuleId}`); } catch {}
      this.sinkModuleId = null;
    }
  }
}
```

### Pattern 3: Virtual Camera Test Feed with ffmpeg

Feed a test pattern at consistent frame rate so Chrome sees live video, not a frozen frame.

```bash
# Command the Node.js code spawns as a child process:
ffmpeg -f lavfi -i testsrc=size=1280x720:rate=30 \
  -f v4l2 -pix_fmt yuv420p /dev/video10

# For static placeholder image (Phase 3 will replace this):
ffmpeg -loop 1 -re -i /path/to/placeholder.jpg \
  -f v4l2 -pix_fmt yuv420p -r 30 /dev/video10
```

```typescript
// src/devices/virtual-camera.ts
import { spawn, ChildProcess } from 'child_process';

export class VirtualCamera {
  private ffmpegProcess: ChildProcess | null = null;

  startTestPattern(devicePath: string): void {
    this.ffmpegProcess = spawn('ffmpeg', [
      '-f', 'lavfi',
      '-i', 'testsrc=size=1280x720:rate=30',
      '-f', 'v4l2',
      '-pix_fmt', 'yuv420p',
      devicePath,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    this.ffmpegProcess.on('error', (err) => {
      console.error(`[VirtualCamera] ffmpeg error: ${err.message}`);
    });
  }

  stop(): void {
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill('SIGTERM');
      this.ffmpegProcess = null;
    }
  }
}
```

### Pattern 4: Platform Detection

Detect WSL2 at startup to branch device strategy.

```typescript
// src/platform/detect.ts
import { readFileSync } from 'fs';

export type Platform = 'native-linux' | 'wsl2';

export function detectPlatform(): Platform {
  try {
    const osRelease = readFileSync('/proc/version', 'utf8');
    if (osRelease.toLowerCase().includes('microsoft') || osRelease.toLowerCase().includes('wsl')) {
      return 'wsl2';
    }
  } catch {}
  return 'native-linux';
}
```

### Pattern 5: Config File Schema (Zod)

```typescript
// src/config/schema.ts
import { z } from 'zod';

export const ConfigSchema = z.object({
  devices: z.object({
    camera: z.object({
      label: z.string().default('AI Meet Agent Camera'),
      videoNr: z.number().int().min(0).max(63).default(10),
    }),
    mic: z.object({
      label: z.string().default('AI Meet Agent Mic'),
      sinkName: z.string().default('ai_meet_mic'),
    }),
    sink: z.object({
      label: z.string().default('AI Meet Agent Sink'),
      sinkName: z.string().default('ai_meet_sink'),
    }),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;
```

**config.json (user-facing):**
```json
{
  "devices": {
    "camera": {
      "label": "AI Meet Agent Camera",
      "videoNr": 10
    },
    "mic": {
      "label": "AI Meet Agent Mic",
      "sinkName": "ai_meet_mic"
    },
    "sink": {
      "label": "AI Meet Agent Sink",
      "sinkName": "ai_meet_sink"
    }
  }
}
```

### Anti-Patterns to Avoid

- **Do not use `exclusive_caps=0` with Chrome:** Without `exclusive_caps=1`, Chrome/WebRTC will not see the v4l2loopback device in `getUserMedia` device enumeration. This is the most common reason "the device exists but Chrome doesn't list it."
- **Do not use monitor sources as microphones directly:** Chrome filters "monitor" sources out of microphone lists in some configurations. Use `media.class=Audio/Source/Virtual` or `module-remap-source` to create a proper source.
- **Do not push frames only when content changes:** ffmpeg (or whatever writes to `/dev/video10`) must push frames at a consistent rate (30fps). Irregular frame delivery causes Chrome to show a frozen or stuttering video.
- **Do not assume pactl modules survive process restart or WSLg session:** pactl modules are runtime-only. The program must reload them on startup and unload on exit. On WSLg, they may disappear after ~2 minutes — treat this as a known risk.
- **Do not require sudo for daily operation:** `modprobe` needs sudo once at setup. After that, `/dev/videoN` exists and the program writes to it without sudo. pactl runs as user. Design the daily-operation path to be sudo-free.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Virtual camera kernel device | Custom V4L2 ioctl device driver | v4l2loopback kernel module | Writing a kernel module is a months-long project; v4l2loopback is battle-tested and exactly solves this |
| Feeding video to virtual camera | Custom V4L2 write loop from Node.js | `ffmpeg -f v4l2` subprocess | ffmpeg handles pixel format negotiation, frame rate pacing, and V4L2 ioctl details; raw Node.js V4L2 writing requires native addon + extensive V4L2 knowledge |
| Config validation | Custom JSON validation | `zod` | Edge cases in JSON parsing (undefined vs null, type coercion) are subtle; zod gives clear error messages with minimal code |
| Audio module lifecycle | Custom ALSA programming | `pactl load-module` / `unload-module` | PulseAudio/PipeWire module system is designed exactly for runtime virtual device management |
| WSL2 platform detection | Parse Windows registry | Read `/proc/version` for "microsoft"/"wsl" | Simple, reliable, no Windows API needed |

**Key insight:** This phase is almost entirely orchestration of existing Linux tools via subprocess calls. Node.js is a coordinator, not an implementor. The actual device creation is done by kernel modules and system utilities — Node.js just invokes them and checks their output.

---

## Common Pitfalls

### Pitfall 1: Chrome Does Not See v4l2loopback Without exclusive_caps=1
**What goes wrong:** Device appears in `lsmod` and `ls /dev/video10`, but Chrome's camera picker shows nothing.
**Why it happens:** Chrome/WebRTC expects camera devices to advertise CAPTURE capabilities only. Without `exclusive_caps=1`, v4l2loopback advertises both OUTPUT and CAPTURE, which Chrome interprets as "not a camera."
**How to avoid:** Always load with `exclusive_caps=1`. Verify with `v4l2-ctl --list-devices` after loading.
**Warning signs:** `/dev/video10` exists, ffmpeg can write to it, but Chrome device picker is empty.

### Pitfall 2: PulseAudio Monitor Sources Filtered From Chrome Mic List
**What goes wrong:** Virtual sink created, its `.monitor` appears in `pactl list sources`, but Chrome's microphone picker doesn't show it.
**Why it happens:** Chrome (and many apps) filter sources whose name ends in `.monitor` when displaying microphone options. A null-sink's auto-created monitor is named `sink_name.monitor`.
**How to avoid:** Use `media.class=Audio/Source/Virtual` in the `module-null-sink` command OR use `pactl load-module module-remap-source master=ai_meet_mic.monitor source_name=ai_meet_mic_input source_properties=device.description="AI Meet Agent Mic"` to create a proper (non-monitor) source.
**Warning signs:** `pactl list sources short` shows the source but Chrome's device list doesn't.

### Pitfall 3: v4l2loopback DKMS Fails on WSL2
**What goes wrong:** `sudo apt install v4l2loopback-dkms` appears to succeed, `sudo modprobe v4l2loopback` fails with "Module not found" or silent failure.
**Why it happens:** WSL2's kernel is Microsoft's custom kernel; DKMS compiles against the running kernel headers, which on WSL2 are not the standard Ubuntu headers. The module compiles for the wrong kernel or headers are missing.
**How to avoid:** Test `modprobe` immediately after install. If it fails, fall back to the Windows-side approach (OBS Virtual Camera + VB-Cable) rather than spending days on kernel compilation.
**Warning signs:** `lsmod | grep v4l2loopback` returns nothing after modprobe.

### Pitfall 4: WSLg Audio Module Eviction (~2 minutes)
**What goes wrong:** `pactl load-module module-null-sink ...` succeeds, Chrome sees the device briefly, then it disappears.
**Why it happens:** WSLg uses PulseAudio over RDP. Ubuntu 22.04+ ships PipeWire as the audio server; the `pipewire-pulse` compatibility layer handles `pactl` commands. Under WSLg, there is a conflict: WSLg expects to manage the PulseAudio session, and user-loaded modules may be evicted by WSLg's own PulseAudio daemon restart logic. This is an open bug with no upstream fix.
**How to avoid:** If you observe this, treat WSLg audio path as unsupported and document the VB-Cable fallback. Alternatively, persist modules in `~/.config/pulse/default.pa` (though WSLg may still override).
**Warning signs:** Device visible in Chrome immediately after creation, gone 2 minutes later without any explicit unload command.

### Pitfall 5: Chrome on Windows Cannot See Linux Devices (Architecture Mismatch)
**What goes wrong:** All devices created successfully in WSL2, but Chrome on Windows shows no virtual camera or mic.
**Why it happens:** Chrome on Windows uses Windows camera APIs (DirectShow/Media Foundation) and Windows audio APIs (WASAPI). Linux `/dev/videoN` and PulseAudio sinks exist only in the Linux subsystem and are completely invisible to Windows applications.
**How to avoid:** Make the architecture decision explicit in the first task of this phase. If Chrome runs on Windows, the device path must be Windows-side (OBS Virtual Camera + VB-Cable). If Chrome runs in WSL2 via WSLg, Linux devices may work but require kernel compilation.
**Warning signs:** This is not a warning — it is a guaranteed outcome. Chrome on Windows will never see Linux virtual devices. Treat it as a design constraint.

### Pitfall 6: Inconsistent Frame Rate Freezes Chrome Video
**What goes wrong:** Virtual camera is registered, Chrome shows the device, but video appears frozen.
**Why it happens:** If the ffmpeg process writing to `/dev/video10` exits or is not running, or if frames are pushed irregularly, Chrome shows the last received frame frozen.
**How to avoid:** Keep ffmpeg running continuously as a managed child process. Use `-r 30` to enforce consistent frame rate. Monitor the ffmpeg process and restart if it exits.
**Warning signs:** Chrome shows a static frame that never updates even when you expect it to.

---

## Code Examples

### Verify v4l2loopback is loaded and device is accessible

```typescript
// Source: standard lsmod + ls pattern, training data HIGH confidence
import { execSync } from 'child_process';

function isV4l2loopbackLoaded(): boolean {
  try {
    execSync('lsmod | grep -q v4l2loopback', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function videoDeviceExists(devicePath: string): boolean {
  try {
    execSync(`test -c ${devicePath}`, { stdio: 'pipe' }); // -c = character device
    return true;
  } catch {
    return false;
  }
}
```

### Load v4l2loopback with correct Chrome-compatible parameters

```bash
# Source: v4l2loopback README + community verified
# exclusive_caps=1 is REQUIRED for Chrome to see the device
# video_nr=10 avoids collision with real webcams (typically video0, video1)
# card_label appears as the device name in Chrome's camera picker
sudo modprobe v4l2loopback \
  video_nr=10 \
  card_label="AI Meet Agent Camera" \
  exclusive_caps=1 \
  max_buffers=2
```

### Persist modprobe options across reboots (native Linux)

```bash
# /etc/modprobe.d/ai-meet-agent.conf
options v4l2loopback video_nr=10 card_label="AI Meet Agent Camera" exclusive_caps=1 max_buffers=2

# Load on boot
echo "v4l2loopback" | sudo tee /etc/modules-load.d/ai-meet-agent.conf
```

### Create virtual audio devices (PipeWire/PulseAudio compatible)

```bash
# Source: PipeWire documentation + luke.hsiao.dev virtual mic guide
# Step 1: Create virtual speaker sink (AI audio output goes here)
SINK_MODULE=$(pactl load-module module-null-sink \
  sink_name=ai_meet_sink \
  "sink_properties=device.description='AI Meet Agent Sink'")

# Step 2: Create virtual microphone source (Chrome sees this as an input)
# media.class=Audio/Source/Virtual makes it appear as a mic, not a monitor
MIC_MODULE=$(pactl load-module module-null-sink \
  media.class=Audio/Source/Virtual \
  sink_name=ai_meet_mic \
  "sink_properties=device.description='AI Meet Agent Mic'")

# Verify both appear
pactl list sources short | grep ai_meet
pactl list sinks short | grep ai_meet

# Cleanup on exit
pactl unload-module $SINK_MODULE
pactl unload-module $MIC_MODULE
```

### Feed test pattern to virtual camera

```bash
# Source: ffmpeg documentation + community v4l2loopback guides
# Runs until killed — spawn as child process from Node.js
ffmpeg \
  -f lavfi \
  -i "testsrc=size=1280x720:rate=30" \
  -f v4l2 \
  -pix_fmt yuv420p \
  /dev/video10
```

### Play test tone through virtual mic (audio path validation)

```bash
# Generate 440Hz sine wave for 3 seconds, output to virtual mic sink
ffmpeg \
  -f lavfi \
  -i "sine=frequency=440:duration=3" \
  -f pulse \
  -device ai_meet_mic \
  - 2>/dev/null
```

### Verify device appears in Chrome (manual validation step)

```
1. Open Chrome
2. Navigate to chrome://settings/content/camera
3. Confirm "AI Meet Agent Camera" appears in dropdown
4. Navigate to chrome://settings/content/microphone
5. Confirm "AI Meet Agent Mic" appears in dropdown
6. Alternatively: open https://webcamtests.com and verify camera feed shows test pattern
```

---

## State of the Art

| Old Approach | Current Approach | Impact for This Project |
|--------------|-----------------|------------------------|
| PulseAudio as primary audio server | PipeWire + `pipewire-pulse` compat layer (Ubuntu 22.04+) | Use `pactl` commands — they work identically on both. No code change needed. |
| `module-loopback` for virtual mic | `media.class=Audio/Source/Virtual` in module-null-sink | More browser-compatible; avoids monitor-source filtering issue |
| ALSA `snd-aloop` for audio loopback | PipeWire/PulseAudio null-sink | null-sink is browser-visible; snd-aloop is not via getUserMedia |
| OBS as the only virtual camera option | v4l2loopback directly | v4l2loopback is lighter; no OBS running required |
| Manual kernel recompile for each v4l2 update | DKMS package rebuilds automatically | Use DKMS on native Linux; accept manual for WSL2 |
| WSL2 had no audio | WSLg provides PulseAudio via RDP audio (Windows 11) | Audio possible in WSL2 but with documented stability issues |

**Deprecated/outdated:**
- `module-loopback` approach for creating virtual mics: Works, but the monitor-source filtering issue makes it unreliable for Chrome. Superseded by `media.class=Audio/Source/Virtual`.
- `modprobe v4l2loopback` without `exclusive_caps=1`: This was acceptable in older Chrome versions but is required for modern Chrome WebRTC.
- PulseAudio standalone (without PipeWire): Still works on older systems, but on Ubuntu 22.04+ the system ships PipeWire — `pipewire-pulse` handles pactl commands transparently.

---

## Open Questions

1. **WSL2 Virtual Camera: Does Chrome inside WSL2 via WSLg see v4l2loopback?**
   - What we know: v4l2loopback requires custom WSL2 kernel compilation. WSLg forwards display and audio but not V4L2 devices specifically.
   - What's unclear: Whether WSLg's X11/Wayland forwarding causes Chrome (running in WSL2) to see `/dev/video10` as it would on native Linux.
   - Recommendation: This is a research spike at the start of Phase 1. The answer determines the entire WSL2 camera architecture. If yes: compile custom kernel, ship that. If no: document OBS Virtual Camera as WSL2 path.

2. **WSL2 Virtual Audio: PipeWire vs PulseAudio conflict under WSLg**
   - What we know: WSLg uses PulseAudio over RDP. Ubuntu 22.04+ ships PipeWire. These conflict. Virtual modules loaded via pactl disappear after ~2 minutes in some WSLg setups.
   - What's unclear: Whether WSL version 2.3.26+ (mentioned in voice-mode docs as supporting microphone with `libasound2-plugins pulseaudio`) stabilizes this, and whether virtual sources created that way are visible in Chrome getUserMedia.
   - Recommendation: Early in Phase 1, test: `wsl --version` to check WSL version, then attempt the virtual source setup and verify Chrome sees it after 5+ minutes. If unstable, move to VB-Cable fallback.

3. **VB-Cable audio format compatibility with Node.js PCM output**
   - What we know: VB-Cable is a Windows virtual audio cable that Chrome on Windows sees as a regular audio device. Node.js would need to write audio to VB-Cable via Windows audio API (not PulseAudio).
   - What's unclear: How Node.js running in WSL2 writes audio to a Windows audio device (VB-Cable). Options: PulseAudio TCP bridge to Windows PulseAudio → VB-Cable, or cross-process via named pipe.
   - Recommendation: If WSL2 + VB-Cable path is chosen, design this interface point in Phase 1 even if full implementation is Phase 2. The interface decision (PulseAudio TCP bridge vs. other) affects Phase 2 architecture.

4. **`max_buffers` value for v4l2loopback**
   - What we know: `max_buffers=2` is commonly recommended for low-latency use cases.
   - What's unclear: Whether 2 is optimal for the ffmpeg write loop that Phase 3 will use, or if Phase 3's video rendering needs more buffers.
   - Recommendation: Start with `max_buffers=2` and tune in Phase 3 if video glitches appear.

---

## WSL2 Architecture Decision Guide

This decision must be made explicitly at the start of Phase 1. It determines all subsequent device work.

```
IS CHROME RUNNING IN WSL2 (via WSLg) OR ON WINDOWS?

├── Chrome in WSL2 via WSLg
│   ├── Camera: Requires custom WSL2 kernel with v4l2loopback
│   │   └── Steps: Clone WSL2 kernel, enable CONFIG_V4L2_LOOPBACK, build, point .wslconfig to it
│   └── Audio: May work with PulseAudio via WSLg RDP audio
│       └── Risk: Module eviction bug (~2min). Test stability before committing.
│
└── Chrome on Windows (RECOMMENDED FALLBACK if WSLg path is unstable)
    ├── Camera: OBS Studio + OBS Virtual Camera plugin (Windows)
    │   └── User starts OBS before launching agent. OBS presents a Windows DirectShow device.
    └── Audio: VB-Cable (Windows virtual audio cable)
        └── Windows Chrome sees VB-Cable as a real Windows mic/speaker device.
        └── Node.js in WSL2 must bridge audio: PulseAudio TCP → Windows PulseAudio → VB-Cable
```

---

## Sources

### Primary (HIGH confidence)
- v4l2loopback GitHub README (https://github.com/v4l2loopback/v4l2loopback) — `exclusive_caps`, `card_label`, `video_nr` parameters, Chrome compatibility requirement
- Ubuntu packages for v4l2loopback-dkms in Jammy (https://packages.ubuntu.com/jammy/v4l2loopback-dkms) — version 0.12.7-2ubuntu2~22.04.1
- WSLg GitHub issue #290 (https://github.com/microsoft/wslg/issues/290) — confirms WSLg uses PulseAudio (not PipeWire), PipeWire support is incomplete
- WSLg Discussion #1141 (https://github.com/microsoft/wslg/discussions/1141) — pactl null-sink modules disappear after ~2 minutes in WSLg

### Secondary (MEDIUM confidence)
- PipeWire virtual microphone guide (https://luke.hsiao.dev/blog/pipewire-virtual-microphone/) — `media.class=Audio/Source/Virtual` command pattern for Chrome-visible virtual source
- PipeWire Virtual Devices (https://www.benashby.com/resources/pipewire-virtual-devices/) — persistent config file approach vs. runtime pactl
- PipeWire ArchWiki examples (https://wiki.archlinux.org/title/PipeWire/Examples) — null-sink creation with `object.linger`
- Box of Cables WSL2 kernel build guide 2025 (https://boxofcables.dev/how-to-build-a-custom-kernel-for-wsl-in-2025/) — confirmed custom kernel build process is still required; provides general build flow
- ffmpeg v4l2 output (https://trac.ffmpeg.org/wiki/Capture/Webcam) — `ffmpeg -f lavfi -i testsrc ... -f v4l2 -pix_fmt yuv420p /dev/video10` pattern
- voice-mode WSL2 microphone docs (https://voice-mode.readthedocs.io/en/stable/troubleshooting/wsl2-microphone-access/) — WSL2 version 2.3.26+ with WSLg enables microphone access via `libasound2-plugins pulseaudio`

### Tertiary (LOW confidence — flag for validation)
- Community reports that Chrome 110+ supports PipeWire WebRTC by default (multiple Arch Linux forum posts, NixOS issue tracker) — needs verification against current Chrome version
- `exclusive_caps=1` may not work in all Chromium versions (GitHub v4l2loopback issue #274) — test against current Chrome before assuming it works
- VB-Cable + PulseAudio TCP bridge pattern for WSL2 audio — described in multiple guides but untested for this project's specific use case

---

## Metadata

**Confidence breakdown:**
- Standard stack (native Linux): HIGH — v4l2loopback + PipeWire null-sink is well-established, widely deployed
- Standard stack (WSL2): LOW-MEDIUM — custom kernel compilation documented but complex; WSLg audio instability confirmed
- Architecture patterns: HIGH — subprocess orchestration pattern is straightforward Node.js
- Pitfalls: HIGH for native Linux; MEDIUM for WSL2 (actively moving target)

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (30 days for the stable Linux parts; WSL2 specifics may change faster)
