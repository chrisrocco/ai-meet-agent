# Requirements: AI Meet Agent

**Defined:** 2026-03-25
**Core Value:** Bidirectional realtime audio conversation through a Google Meet call — someone speaks, the AI twin hears and responds naturally.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Virtual Devices

- [x] **VDEV-01**: Virtual camera device appears as selectable webcam in browser (e.g. "Mock Input")
- [x] **VDEV-02**: Virtual microphone device appears as selectable mic in browser (e.g. "Mock Input")
- [x] **VDEV-03**: Static placeholder image fed through virtual camera as video stream

### Audio Pipeline

- [x] **AUDI-01**: Capture incoming audio from Google Meet participants via virtual audio routing
- [x] **AUDI-02**: Stream captured audio to Google AI API in realtime (chunked PCM/WebSocket)
- [x] **AUDI-03**: Receive AI-generated audio responses and play through virtual microphone into Meet
- [x] **AUDI-04**: Echo cancellation via architectural sink isolation — AI output does not loop back into capture path
- [x] **AUDI-05**: Low-latency audio round-trip under 2 seconds for conversational feel

### AI Conversation

- [x] **CONV-01**: Configurable persona via system prompt (name, role, background, meeting context)
- [ ] **CONV-02**: Per-meeting context injection (agenda, attendee bios prepended to system prompt)
- [ ] **CONV-03**: Conversation memory within session — AI remembers earlier parts of the call

### Operator Experience

- [ ] **OPER-01**: Operator can monitor the call from behind the browser (hear participants + AI)
- [ ] **OPER-02**: Live transcript display showing what participants said and what AI responded

### Platform

- [x] **PLAT-01**: Works on Linux (native) with PulseAudio/PipeWire and v4l2loopback
- [x] **PLAT-02**: Works on Linux (WSL2) with appropriate device routing for the environment

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Audio Enhancement

- **AUDI-06**: Voice Activity Detection — AI knows when to speak vs listen, prevents talking over others
- **AUDI-07**: Noise suppression on captured audio before sending to AI API

### AI Conversation

- **CONV-04**: Graceful silence / hold behavior — AI only outputs audio when it has a turn to speak
- **CONV-05**: Configurable response style (formal/casual/brief/verbose)
- **CONV-06**: Wake word / activation trigger — AI only responds after hearing its name

### Operator Experience

- **OPER-03**: Operator override / intervene capability — inject content into AI's response
- **OPER-04**: Auto-mute when operator intervenes physically
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
| Cloud deployment / SaaS mode | Audio device virtualization in cloud is non-trivial |
| Persistent conversation storage | Privacy risk, scope creep, not needed for live interaction |
| Full Web UI / control panel | Over-engineering for v1; CLI + config file is faster |
| Calendar integration / auto-scheduling | OAuth complexity, not core to twin experience |
| Real-time sentiment analysis | UI complexity for marginal v1 value |
| Mobile support | Desktop Linux only |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| VDEV-01 | Phase 1 | In Progress (device layer built; browser verification in plan 04) |
| VDEV-02 | Phase 1 | In Progress (device layer built; browser verification in plan 04) |
| VDEV-03 | Phase 3 | Complete |
| AUDI-01 | Phase 2 | Complete |
| AUDI-02 | Phase 4 | Complete |
| AUDI-03 | Phase 4 | Complete |
| AUDI-04 | Phase 2 | Complete |
| AUDI-05 | Phase 4 | Complete |
| CONV-01 | Phase 4 | Complete |
| CONV-02 | Phase 5 | Pending |
| CONV-03 | Phase 5 | Pending |
| OPER-01 | Phase 5 | Pending |
| OPER-02 | Phase 5 | Pending |
| PLAT-01 | Phase 1 | Complete |
| PLAT-02 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0

---
*Requirements defined: 2026-03-25*
*Last updated: 2026-03-26 after Phase 2 complete (AUDI-01, AUDI-04 complete)*
