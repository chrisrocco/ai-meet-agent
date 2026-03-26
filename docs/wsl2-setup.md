# WSL2 Setup Guide

**Architecture decision:** PATH B — Chrome on Windows + Windows-side bridges
**Decision made:** 2026-03-26
**Reason:** Probe of WSL2 2.3.26.0 / WSLg 1.0.65 / kernel 5.15.167.4-microsoft-standard-WSL2 showed that the v4l2loopback DKMS module is not compiled for the WSL2 kernel (no extra modules directory) and `pactl` is not available. Neither WSLg camera nor WSLg audio path is viable without significant kernel customization.

## Probe Results

```
Kernel:        5.15.167.4-microsoft-standard-WSL2
WSL version:   2.3.26.0
WSLg version:  1.0.65

v4l2loopback:  NOT AVAILABLE
  modinfo v4l2loopback → "Module v4l2loopback not found."
  /lib/modules/.../extra/ → directory does not exist
  Conclusion: DKMS did not compile for this kernel — PATH A camera not viable

pactl:         NOT FOUND
  pactl: command not found
  Conclusion: No WSLg audio integration — PATH A audio not viable
```

## Chosen Path: PATH B — Chrome on Windows + Windows Bridges

Chrome runs on Windows and uses Windows device APIs (DirectShow for camera, WASAPI for audio).
Linux virtual devices (/dev/videoN, PulseAudio) are not visible to Chrome on Windows.
Windows-side bridges expose virtual devices that Chrome sees natively.

## Path B: Camera — OBS Virtual Camera

OBS Studio provides a Windows DirectShow virtual camera device. Chrome on Windows sees it as a real webcam.

### Installation

1. Download and install OBS Studio from https://obsproject.com/
2. Launch OBS Studio
3. Go to **Tools → VirtualCam → Start Virtual Camera**
4. OBS Virtual Camera is now active as a DirectShow device

### Verify in Chrome

1. Open Chrome on Windows
2. Navigate to `chrome://settings/content/camera`
3. **"OBS Virtual Camera"** should appear in the webcam dropdown

### Node.js → OBS video bridge (Phase 3)

The Node.js process running in WSL2 will push video frames to OBS via one of:
- OBS WebSocket API (obs-websocket-js) — preferred
- FFmpeg → named pipe → OBS media source
- Virtual camera written from WSL2 via /dev/videoN with usbipd-win (advanced)

*To be determined in Phase 3.*

## Path B: Audio — VB-Cable (Virtual Audio Cable)

VB-Cable creates a Windows virtual audio device pair: a virtual microphone output that Chrome sees as a real mic input.

### Installation

1. Download VB-Cable from https://vb-audio.com/Cable/ (free)
2. Run the installer as Administrator
3. Reboot Windows (required for driver to load)
4. After reboot, Windows shows two new audio devices:
   - **CABLE Input (VB-Audio Virtual Cable)** — playback device (write audio here)
   - **CABLE Output (VB-Audio Virtual Cable)** — recording device (Chrome reads from here)

### Verify in Chrome

1. Open Chrome on Windows
2. Navigate to `chrome://settings/content/microphone`
3. **"CABLE Output (VB-Audio Virtual Cable)"** should appear in the microphone dropdown

### Node.js → VB-Cable audio bridge (Phase 2)

The Node.js process running in WSL2 will push PCM audio to VB-Cable via one of:
- PulseAudio TCP → Windows PulseAudio → route to CABLE Input
- FFmpeg WASAPI sink via wsl.exe interop
- Windows audio API via Node.js FFI (node-ffi-napi or edge-js)

*To be determined in Phase 2.*

## Native Linux (Development / CI)

On native Linux (no WSL2), the standard v4l2loopback + PulseAudio path works:

```bash
bash scripts/setup.sh          # one-time: installs packages, persists module
npm run test-devices           # verify: creates devices for 5s, exits 0
```

Chrome on Linux sees:
- **AI Meet Agent Camera** via /dev/video10 (v4l2loopback)
- **AI Meet Agent Mic** via PulseAudio null-sink with media.class=Audio/Source/Virtual

## Confirmed Device Visibility

*Update this section after completing Windows-side bridge setup.*

| Environment | Device | Visible in Chrome | Notes |
|-------------|--------|-------------------|-------|
| Native Linux | AI Meet Agent Camera | TBD | Run test-devices |
| Native Linux | AI Meet Agent Mic | TBD | Run test-devices |
| WSL2/Windows | OBS Virtual Camera | TBD | Requires OBS install |
| WSL2/Windows | CABLE Output (VB-Audio) | TBD | Requires VB-Cable install |

## Limitations and Future Work

- WSL2 PATH A (WSLg) requires compiling a custom kernel with `CONFIG_V4L2_LOOPBACK=m` — not pursued per CONTEXT.md decision to not block the project
- The Node.js audio/video bridge from WSL2 to Windows-side devices is a Phase 2/3 concern
- If the Windows bridge approach proves too complex, the fallback is native Linux only

## See Also

- `scripts/setup-wsl2-windows.md` — step-by-step Windows-side setup checklist
- `scripts/setup.sh` — native Linux one-time setup
- `src/platform/wsl2.ts` — programmatic WSL2 prerequisite check
- `src/platform/detect.ts` — platform detection (native-linux vs wsl2)
