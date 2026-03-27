# AI Meet Agent

AI meeting twin — bidirectional realtime audio conversation through Google Meet. Someone speaks, the AI twin hears and responds naturally.

## Prerequisites

- Node.js >= 22
- Linux (native or WSL2)
- Google Gemini API key (`GEMINI_API_KEY`)
- ffmpeg (`sudo apt install ffmpeg`)
- PipeWire/PulseAudio (typically pre-installed on modern Linux)

### Native Linux Only

- v4l2loopback kernel module (for virtual camera)

### WSL2 Only

- OBS Virtual Camera (Windows side)
- VB-Audio Virtual Cable (Windows side)

## Installation

```bash
npm install -g ai-meet-agent
```

Or run without installing:

```bash
npx ai-meet-agent start
```

## Quick Start

1. Set your API key:
   ```bash
   export GEMINI_API_KEY=your-key-here
   ```

2. (Optional) Copy and edit the example config:
   ```bash
   cp node_modules/ai-meet-agent/config.example.json ./config.json
   ```

3. Start a session:
   ```bash
   ai-meet start
   ```

4. Open Google Meet, select "AI Meet Agent Camera" and "AI Meet Agent Mic" as your devices.

## Commands

| Command | Description |
|---------|-------------|
| `ai-meet start` | Launch a meeting session |
| `ai-meet start --config <path>` | Use a specific config file |
| `ai-meet start --notes <path>` | Load meeting context from markdown |
| `ai-meet start --role <path>` | Load persona from a role file |
| `ai-meet start --verbose` | Enable verbose audio level logging |
| `ai-meet list-devices` | Show available audio/video devices |
| `ai-meet test-audio` | Verify audio device setup |
| `ai-meet --version` | Show version |
| `ai-meet --help` | Show help |

## Configuration

All fields are optional — sensible defaults are used when omitted. See `config.example.json` for the full schema.

### Key Fields

| Field | Default | Description |
|-------|---------|-------------|
| `persona.name` | "AI Assistant" | Name used in transcripts |
| `persona.role` | "Meeting Participant" | Role context for AI |
| `persona.instructions` | "" | Custom behavior instructions |
| `ai.model` | gemini-2.5-flash-native-audio-latest | Gemini model ID |
| `devices.camera.videoNr` | 10 | v4l2loopback device number |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key |

`.env` files in the working directory are loaded automatically.

## Error Codes

| Code | Meaning | Common Fix |
|------|---------|------------|
| 2 | Config error | Check config.json fields — error names the bad field |
| 3 | Missing dependency | Install the dependency shown in the error hint |
| 4 | AI session error | Check GEMINI_API_KEY and network connection |
| 5 | Audio pipeline error | Check PulseAudio/PipeWire setup |

## Troubleshooting

**"ffmpeg: command not found"**
```bash
sudo apt install ffmpeg
```

**"v4l2loopback kernel module not loaded"**
```bash
sudo modprobe v4l2loopback video_nr=10 card_label="AI Meet Agent Camera" exclusive_caps=1 max_buffers=2
```

**"GEMINI_API_KEY not set"**
```bash
export GEMINI_API_KEY=your-key
# Or create a .env file:
echo "GEMINI_API_KEY=your-key" > .env
```

**WSL2 audio not working**

See `docs/wsl2-setup.md` for Windows-side VB-Cable and OBS configuration.

## License

MIT
