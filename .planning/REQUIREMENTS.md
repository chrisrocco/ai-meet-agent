# Requirements: AI Meet Agent

**Defined:** 2026-03-25
**Core Value:** Bidirectional realtime audio conversation through a Google Meet call — someone speaks, the AI twin hears and responds naturally.

## v1.0 Requirements (Validated)

All v1.0 requirements shipped and verified.

### Virtual Devices

- [x] **VDEV-01**: Virtual camera device appears as selectable webcam in browser — Phase 1
- [x] **VDEV-02**: Virtual microphone device appears as selectable mic in browser — Phase 1
- [x] **VDEV-03**: Static placeholder image fed through virtual camera as video stream — Phase 3

### Audio Pipeline

- [x] **AUDI-01**: Capture incoming audio from Google Meet participants — Phase 2
- [x] **AUDI-02**: Stream captured audio to Google AI API in realtime — Phase 4
- [x] **AUDI-03**: Receive AI-generated audio responses and play through virtual mic — Phase 4
- [x] **AUDI-04**: Echo cancellation via architectural sink isolation — Phase 2
- [x] **AUDI-05**: Low-latency audio round-trip under 2 seconds — Phase 4

### AI Conversation

- [x] **CONV-01**: Configurable persona via system prompt — Phase 4
- [x] **CONV-02**: Per-meeting context injection — Phase 5
- [x] **CONV-03**: Conversation memory within session — Phase 5

### Operator Experience

- [x] **OPER-01**: Operator can monitor the call — Phase 5
- [x] **OPER-02**: Live transcript display — Phase 5

### Platform

- [x] **PLAT-01**: Works on Linux (native) — Phase 1
- [x] **PLAT-02**: Works on Linux (WSL2) — Phase 1/6

## v1.1 Requirements

Requirements for Cleaner API milestone. Each maps to roadmap phases.

### CLI Packaging

- [ ] **CLI-01**: User can install ai-meet globally via `npm install -g`
- [ ] **CLI-02**: User can run `ai-meet --version` to see installed version
- [ ] **CLI-03**: User can run `ai-meet --help` to see available subcommands
- [ ] **CLI-04**: User can run `npx ai-meet start` without global install

### Subcommands

- [ ] **CMD-01**: User can run `ai-meet start` to launch a meeting session
- [ ] **CMD-02**: User can run `ai-meet start --help` to see start-specific flags
- [ ] **CMD-03**: User can run `ai-meet list-devices` to see available audio/video devices
- [ ] **CMD-04**: User can run `ai-meet test-audio` to verify device setup before a call

### Config

- [ ] **CFG-01**: User can pass `--config <path>` to specify config file location
- [ ] **CFG-02**: User can pass `--notes <path>` to load meeting context from a markdown file
- [ ] **CFG-03**: User can pass `--role <path>` to load persona from a file

### Error Handling

- [ ] **ERR-01**: Missing dependencies (ffmpeg, VB-Cable) show actionable fix instructions
- [ ] **ERR-02**: Config validation errors name the specific field and expected value
- [ ] **ERR-03**: Critical failures (audio/AI) exit with clear message; degraded failures (video/monitor) warn and continue

### Provider Abstraction

- [ ] **PROV-01**: AI session logic uses a RealtimeAudioProvider interface, not Gemini directly
- [ ] **PROV-02**: GeminiProvider wraps existing GeminiLiveSession without modifying it

## Future Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Additional Providers

- **PROV-03**: User can select OpenAI Realtime API as an alternative provider
- **PROV-04**: User can select a local model as a provider

### Audio Enhancement

- **AUDI-06**: Voice Activity Detection
- **AUDI-07**: Noise suppression on captured audio

### AI Conversation

- **CONV-04**: Graceful silence / hold behavior
- **CONV-05**: Configurable response style
- **CONV-06**: Wake word / activation trigger

### Operator Experience

- **OPER-03**: Operator override / intervene capability
- **OPER-04**: Auto-mute when operator intervenes
- **OPER-05**: Session summary generation at call end

### Platform

- **PLAT-03**: Zoom support
- **PLAT-04**: Browser automation for auto-joining calls

## Out of Scope

| Feature | Reason |
|---------|--------|
| AI-generated video / avatar | High latency, GPU-intensive, not needed for audio twin |
| Voice cloning / voice matching | Legally and ethically fraught, high complexity |
| Multi-call support | Device routing ambiguity, process isolation complexity |
| Plugin system for providers | Over-engineering; interface + concrete implementations handles realistic cases |
| YAML config format | JSON with Zod validation works; adds parse dependency without solving a real problem |
| Remote config from URL | Adds network dependency and security surface; single-user tool |
| Interactive init wizard | Scope overhead; config template achieves same outcome faster |
| Hot-reload config | Audio pipeline is stateful; restart is the correct path |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CLI-01 | Phase 8 | Pending |
| CLI-02 | Phase 8 | Pending |
| CLI-03 | Phase 8 | Pending |
| CLI-04 | Phase 8 | Pending |
| CMD-01 | Phase 8 | Pending |
| CMD-02 | Phase 8 | Pending |
| CMD-03 | Phase 8 | Pending |
| CMD-04 | Phase 8 | Pending |
| CFG-01 | Phase 8 | Pending |
| CFG-02 | Phase 8 | Pending |
| CFG-03 | Phase 7 | Pending |
| ERR-01 | Phase 9 | Pending |
| ERR-02 | Phase 9 | Pending |
| ERR-03 | Phase 9 | Pending |
| PROV-01 | Phase 7 | Pending |
| PROV-02 | Phase 7 | Pending |

**Coverage:**
- v1.1 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-25*
*Last updated: 2026-03-26 after milestone v1.1 roadmap creation*
