# AI Meet Agent

## What This Is

A digital twin system that joins Google Meet calls through virtual audio/video devices. The program creates virtual camera and microphone inputs that appear as selectable devices in the browser. You join the call manually and select the virtual devices — the program handles AI-powered audio conversation and video output behind the scenes.

## Core Value

Bidirectional realtime audio conversation through a Google Meet call — someone speaks, the AI twin hears and responds naturally, creating a convincing stand-in presence.

## Current Milestone: v1.1 Cleaner API

**Goal:** Replace the raw `npm run dev` workflow with an installable CLI tool that has subcommands, file-based meeting/role configuration, graceful error handling, and a provider abstraction layer for future AI model support.

**Target features:**
- Installable CLI tool (`npm install -g` / npx)
- Subcommand interface (`ai-meet start`, `ai-meet list-devices`, `ai-meet test-audio`)
- File-based meeting notes and role/persona configuration (`--notes`, `--role`)
- Graceful error handling with actionable messages (missing deps, silent failures, stack traces)
- AI provider abstraction (Gemini implemented, interface ready for OpenAI/others)

## Requirements

### Validated

- ✓ Virtual camera device appears as selectable webcam in browser — v1.0 Phase 1
- ✓ Virtual microphone device appears as selectable mic in browser — v1.0 Phase 1
- ✓ Capture incoming audio from Google Meet — v1.0 Phase 2
- ✓ Send captured audio to Google AI API for realtime processing — v1.0 Phase 4
- ✓ Receive AI-generated audio responses from Google AI API — v1.0 Phase 4
- ✓ Pipe AI response audio through virtual microphone back into Meet — v1.0 Phase 2/6
- ✓ Bidirectional audio loop works end-to-end in a live call — v1.0 Phase 5
- ✓ Static placeholder image fed through virtual camera as video — v1.0 Phase 3
- ✓ AI twin has configurable persona with system prompt — v1.0 Phase 5
- ✓ Low-latency audio round-trip (conversational feel) — v1.0 Phase 4

### Active

- [ ] Installable CLI tool with subcommand interface
- [ ] File-based meeting notes and role/persona configuration
- [ ] Graceful error handling with actionable messages
- [ ] AI provider abstraction layer (Gemini as first implementation)

### Out of Scope

- Browser automation / auto-joining calls — manual join for v1
- AI-generated video / avatar — static placeholder for v1
- Zoom support — Google Meet first, Zoom later
- Mobile support — desktop Linux only
- Recording/transcription storage — focus on live interaction
- Multi-call support — one call at a time

## Context

- Runs on Linux (WSL2 primary, standard Linux also supported)
- Built with Node.js/TypeScript
- Virtual devices likely via v4l2loopback (video) and PulseAudio/PipeWire (audio) on Linux
- Google AI audio API TBD — needs research (Gemini Live API vs Cloud STT/TTS pipeline vs other options)
- Audio capture from Meet's output also needs research — virtual audio routing approach unclear
- User monitors the call from behind the browser while AI twin handles conversation
- Eventually: browser automation for auto-join, AI video generation, Zoom support

## Constraints

- **Platform**: Linux (WSL2 + standard Linux) — virtual device approach must work in both
- **Runtime**: Node.js/TypeScript
- **Latency**: Audio round-trip must feel conversational (sub-2s target)
- **Integration**: Google Meet via browser device selection, not API hacks
- **Privacy**: No audio/video stored or transmitted beyond the AI API call

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Google Meet first, Zoom later | Same ecosystem as Google Cloud audio APIs, simpler v1 | — Pending |
| Virtual devices over browser automation | User joins manually, selects virtual cam/mic — simpler, more reliable for v1 | — Pending |
| Node.js/TypeScript | User preference, good async model for streaming audio | — Pending |
| Static placeholder video for v1 | Focus effort on audio pipeline, video AI comes later | — Pending |
| Persona with context | AI twin fed system prompt with user's background and meeting context | — Pending |

---
*Last updated: 2026-03-26 after milestone v1.1 start*
