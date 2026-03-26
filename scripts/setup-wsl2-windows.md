# Windows-Side Bridge Setup for WSL2

This guide sets up the Windows-side virtual devices so Chrome on Windows can be used as the Meet client controlled by Node.js running in WSL2.

**Architecture:** Chrome (Windows) ← DirectShow/WASAPI ← OBS Virtual Camera + VB-Cable ← Node.js (WSL2)

---

## Prerequisites

- Windows 10 version 1903+ or Windows 11
- Chrome installed on Windows
- WSL2 installed with this project in a WSL2 distro
- Admin rights on Windows (needed for VB-Cable driver install)

---

## Step 1: Install OBS Virtual Camera

OBS Studio provides a DirectShow virtual camera that Chrome sees natively.

1. Download OBS Studio from https://obsproject.com/
   - Choose the Windows installer (.exe)

2. Run the installer (no admin required for standard install)

3. Launch OBS Studio

4. Go to **Tools** → **VirtualCam** → **Start Virtual Camera**
   - The button label changes to "Stop Virtual Camera" when active
   - OBS Virtual Camera is now registered as a DirectShow device

5. Verify in Chrome:
   - Open `chrome://settings/content/camera`
   - Confirm **"OBS Virtual Camera"** appears in the dropdown
   - (Chrome may need to be restarted once after first OBS install)

**To start virtual camera automatically on boot:**
- Tools → VirtualCam → check "Auto Start"

---

## Step 2: Install VB-Cable (Virtual Audio Cable)

VB-Cable creates a virtual audio device pair for routing audio from WSL2 to Chrome.

1. Download VB-Cable from https://vb-audio.com/Cable/
   - File: VBCABLE_Driver_Pack43.zip (or latest version)
   - Free, no registration required

2. Extract the ZIP file

3. Right-click `VBCABLE_Setup_x64.exe` → **Run as administrator**
   - Click "Install Driver"
   - Accept any Windows driver signing prompts

4. **Reboot Windows** (the audio driver requires a full reboot to load)

5. After reboot, verify in Windows Sound settings:
   - Right-click speaker icon → Sound settings → Output devices
   - **"CABLE Input (VB-Audio Virtual Cable)"** should appear
   - Right-click speaker icon → Sound settings → Input devices
   - **"CABLE Output (VB-Audio Virtual Cable)"** should appear

6. Verify in Chrome:
   - Open `chrome://settings/content/microphone`
   - Confirm **"CABLE Output (VB-Audio Virtual Cable)"** appears in the dropdown

---

## Step 3: Configure Default Chrome Device Selection

Chrome needs to use the bridge devices by default for Meet calls.

1. Open Chrome → `chrome://settings/content/camera`
   - Select **"OBS Virtual Camera"** as the default camera

2. Open Chrome → `chrome://settings/content/microphone`
   - Select **"CABLE Output (VB-Audio Virtual Cable)"** as the default microphone

---

## Step 4: Verify End-to-End (Manual Test)

Before running the Node.js bridge, confirm the Windows-side devices work:

1. Open https://webcamtests.com/ in Chrome (Windows)
   - Camera test: select "OBS Virtual Camera" — should show OBS output (black or scene)
   - If black: OBS is running but no source — that's fine for now (Phase 3 adds video)

2. Open https://www.onlinemictest.com/ in Chrome (Windows)
   - Select "CABLE Output (VB-Audio Virtual Cable)"
   - The mic test will be silent until Phase 2 routes audio from WSL2 — that's expected

---

## Step 5: Configure Chrome for Automation (Puppeteer)

When Puppeteer/Chrome launches via Node.js (Phase 2), Chrome needs flags to use the bridge devices:

```
--use-fake-device-for-media-stream=false   # use real devices (OBS + VB-Cable)
--use-file-for-fake-video-capture          # not needed with real OBS device
```

The DeviceManager (src/devices/index.ts) will pass the correct flags when launching Chrome on Windows from WSL2 via the interop bridge.

*Details to be finalized in Phase 2.*

---

## Step 6: Audio Relay Setup (ffmpeg/ffplay Bridge)

The WSL2 audio relay uses ffmpeg.exe and ffplay.exe on Windows to bridge audio between VB-Cable and the Node.js TCP relay server running in WSL2.

### Install ffmpeg/ffplay on Windows

**Option A: winget (recommended)**
```
winget install Gyan.FFmpeg
```

**Option B: Manual download**
1. Download from https://www.gyan.dev/ffmpeg/builds/ (essentials build)
2. Extract to a folder (e.g., `C:\ffmpeg\`)
3. Add the `bin\` folder to your Windows PATH

**Verify from WSL2:**
```bash
ffmpeg.exe -version
ffplay.exe -version
```

If not on PATH, set full Windows paths in config.json:
```json
{
  "wsl2": {
    "ffmpegPath": "/mnt/c/Users/chris/AppData/Local/Microsoft/WinGet/Links/ffmpeg.exe",
    "ffplayPath": "/mnt/c/Users/chris/AppData/Local/Microsoft/WinGet/Links/ffplay.exe"
  }
}
```

### Configure Chrome Audio Routing for Meet

In Google Meet, route participant audio through VB-Cable so the relay can capture it:

1. In Google Meet, click **⋮** → **Settings** → **Audio**
2. Set **"Speakers"** to **"CABLE Input (VB-Audio Virtual Cable)"**
3. This routes Meet participant audio through VB-Cable for the relay to capture

**Alternative:** Set CABLE Input as the Windows system default output (affects all apps).

### Operator Monitoring (Hearing Meet Audio Through Speakers)

To hear Meet audio yourself while the relay captures it:

1. Open Windows Sound settings → **Recording devices**
2. Right-click **"CABLE Output (VB-Audio Virtual Cable)"** → **Properties**
3. Go to **"Listen"** tab → check **"Listen to this device"**
4. Select your speakers/headphones as the playback device → **OK**

This mirrors CABLE Output to your speakers while still allowing the relay to capture it.

### Verify Audio Devices

**List capture (input) devices:**
```bash
ffmpeg.exe -list_devices true -f dshow -i dummy
```
Look for **"CABLE Output (VB-Audio Virtual Cable)"** — this is the capture device name.

If the name differs from the default, set it in config.json:
```json
{
  "wsl2": {
    "captureDevice": "Your Actual Device Name"
  }
}
```

**Find output device index:**
```bash
ffplay.exe -f s16le -ar 16000 -ac 1 -nodisp -i /dev/zero
```
If the wrong device plays audio, try different `-audio_device_index` values (0, 1, 2...).
Set `wsl2.outputDeviceIndex` in config.json to the correct index for CABLE Input.

### Config Example

```json
{
  "wsl2": {
    "captureDevice": "CABLE Output (VB-Audio Virtual Cable)",
    "outputDeviceIndex": 2,
    "ffmpegPath": "ffmpeg.exe",
    "ffplayPath": "ffplay.exe"
  }
}
```

### Testing the Relay

1. Run `npm run dev` from WSL2
2. You should see: `[AudioRelay] TCP relay listening on port 19876`
3. You should see: `[AudioRelay] Capture client connected` and `[AudioRelay] Output client connected`
4. If bridge processes fail, check stderr output for device name mismatches

---

## Troubleshooting

**OBS Virtual Camera not appearing in Chrome:**
- Ensure OBS is running and Virtual Camera is started (Tools → VirtualCam → Start)
- Restart Chrome after first OBS install
- Check that OBS is installed for the current Windows user (not system-wide for a different user)

**VB-Cable not appearing in Chrome:**
- Verify the Windows reboot completed after driver install
- Open Device Manager → Sound, video, and game controllers — look for "VB-Audio Virtual Cable"
- If missing, re-run `VBCABLE_Setup_x64.exe` as Administrator

**Chrome on Windows cannot access devices:**
- Open Chrome → `chrome://settings/content/camera` — ensure site permissions for Meet are allowed
- For Google Meet specifically: meet.google.com should have camera + mic permissions granted

---

## Architecture Reference

```
WSL2 Node.js process
  │
  ├─ Video: FFmpeg / OBS WebSocket → OBS Scene → OBS Virtual Camera → Chrome (DirectShow)
  │
  └─ Audio: TCP Relay (port 19876)
       ├─ Capture: ffmpeg.exe (dshow) → raw PCM → framed TCP → Wsl2AudioCapture client
       └─ Output:  Wsl2AudioOutput client → framed TCP → raw PCM → ffplay.exe (SDL)
```

The audio relay server runs inside WSL2 as part of `npm run dev`. It spawns ffmpeg.exe and ffplay.exe on the Windows side via WSL2 interop to access VB-Cable audio devices.

---

*Last updated: 2026-03-25*
*See also: docs/wsl2-setup.md for architecture decision and full context*
