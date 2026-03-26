# WSL2 OBS Virtual Camera Setup Guide

Configure OBS Studio on Windows to display the AI Meet Agent's MJPEG video feed as a virtual camera that Chrome can use in Google Meet.

## Architecture

```
WSL2: AI Meet Agent
  → ffmpeg.exe (Windows)
  → HTTP MJPEG server on http://localhost:8085/feed
       ↓
OBS Studio (Windows)
  → Media Source pointing at http://localhost:8085/feed
  → Virtual Camera output (DirectShow)
       ↓
Chrome on Windows
  → Sees "OBS Virtual Camera" as a webcam
  → Use in Google Meet
```

## Prerequisites

- OBS Studio installed on Windows (https://obsproject.com/)
- `ffmpeg.exe` available in the Windows PATH (https://ffmpeg.org/download.html)
  - Download a Windows build, extract, and add the `bin/` folder to System PATH
  - Verify: open PowerShell and run `ffmpeg -version`
- AI Meet Agent running in WSL2 (see below)

## Step 1: Start AI Meet Agent

In your WSL2 terminal:

```bash
npx tsx src/index.ts
```

Wait for this output:

```
[VideoFeed] MJPEG stream at http://localhost:8085/feed
[VideoFeed] Configure OBS Media Source — see docs/wsl2-video-setup.md
```

This confirms the MJPEG HTTP server is running and ready.

## Step 2: Configure OBS Media Source

1. Open **OBS Studio** on Windows.
2. In the **Sources** panel (bottom left), click the **+** button.
3. Select **Media Source**.
4. Name it **"AI Meet Agent Feed"** and click **OK**.
5. In the source properties dialog:
   - **Uncheck** "Local File"
   - Set **Input** to: `http://localhost:8085/feed`
   - Set **Input Format** to: `mjpeg` (if the field is available; otherwise leave it as auto-detect)
   - Leave other settings at defaults
6. Click **OK**.

OBS should immediately display the placeholder image (a gray square). If it shows black, see Troubleshooting below.

## Step 3: Start OBS Virtual Camera

1. In OBS Studio, click **"Start Virtual Camera"** (bottom right of the Controls panel).
   - Alternatively: **Tools → VirtualCam → Start Virtual Camera**
2. The button changes to **"Stop Virtual Camera"** when active.

OBS Virtual Camera is now broadcasting the AI Meet Agent feed as a Windows DirectShow webcam device.

## Step 4: Verify in Chrome

1. Open Chrome on Windows.
2. Navigate to `chrome://settings/content/camera`.
3. **"OBS Virtual Camera"** should appear in the webcam dropdown.
4. Select it and confirm the placeholder image is visible in the preview.

## Step 5: Use in Google Meet

1. Open Google Meet in Chrome.
2. Before or during a call, click the three-dot menu → **Settings → Video**.
3. Set the camera to **"OBS Virtual Camera"**.
4. The placeholder image will appear in your video preview.

## Default Configuration

| Setting       | Default Value                 | Config key             |
|---------------|-------------------------------|------------------------|
| MJPEG port    | 8085                          | `video.mjpegPort`      |
| MJPEG URL     | http://localhost:8085/feed    | —                      |
| Placeholder   | Bundled 1x1 gray JPEG         | `devices.camera.imagePath` |

To use a custom image instead of the placeholder, add to your config file:

```json
{
  "devices": {
    "camera": {
      "imagePath": "/absolute/path/to/your/image.jpg"
    }
  }
}
```

## Troubleshooting

### "ffmpeg.exe is not recognized" (PowerShell error in WSL2 console)

ffmpeg.exe is not in the Windows PATH. Fix:

1. Download a Windows ffmpeg build from https://ffmpeg.org/download.html (e.g., "ffmpeg-release-full")
2. Extract to a folder like `C:\ffmpeg\`
3. Add `C:\ffmpeg\bin` to your Windows System PATH:
   - Open **System Properties → Environment Variables**
   - Under **System variables**, select **Path** → **Edit** → **New**
   - Add `C:\ffmpeg\bin`
   - Click OK and restart any open PowerShell/WSL2 windows
4. Verify: open PowerShell and run `ffmpeg -version`

### OBS shows black instead of the placeholder image

- Confirm AI Meet Agent is running and printed the `[VideoFeed] MJPEG stream at...` line
- Confirm the MJPEG URL is correct: open `http://localhost:8085/feed` in a Windows browser — you should see a repeating placeholder image
- If the browser shows "connection refused", the video feed did not start. Check the WSL2 console for `[VideoFeed] Could not start:` error messages
- In OBS Media Source properties, try clicking **"Restart"** or removing and re-adding the source
- Try setting **Input Format** to `mjpeg` explicitly in the Media Source properties

### Chrome does not show OBS Virtual Camera

- Confirm "Start Virtual Camera" is active in OBS (button should read "Stop Virtual Camera")
- Restart Chrome entirely and recheck `chrome://settings/content/camera`
- If OBS Virtual Camera is still missing: reinstall OBS Studio (the Virtual Camera plugin is bundled since OBS 27+)

### Port conflict: another process using 8085

Change the MJPEG port in your config and restart both AI Meet Agent and update the OBS Media Source URL:

```json
{
  "video": {
    "mjpegPort": 8090
  }
}
```

Then update OBS Media Source URL to `http://localhost:8090/feed`.

## See Also

- `docs/wsl2-setup.md` — overall WSL2 architecture and Windows bridge setup
- `scripts/setup-wsl2-windows.md` — Windows-side VB-Cable and OBS installation checklist
- `src/video/wsl2-feed.ts` — Wsl2VideoFeed implementation (HTTP MJPEG broadcast)
- `src/video/factory.ts` — createVideoFeed() platform routing
