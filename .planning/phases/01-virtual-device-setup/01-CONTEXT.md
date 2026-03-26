# Phase 1: Virtual Device Setup - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Create virtual camera and virtual microphone devices on Linux that appear as selectable inputs in Chrome's device picker. Support both native Linux and WSL2 environments. This phase is pure device plumbing — no audio pipeline, no AI, no video content beyond validation.

</domain>

<decisions>
## Implementation Decisions

### WSL2 Strategy
- WSL2 is the primary development environment — user runs Chrome on Windows, dev tools in WSL2
- Native Linux support is also required but WSL2 is day-to-day use
- If WSL2 virtual devices prove too difficult (kernel compilation, broken audio bridges), document limitations and ship native Linux support — don't block the project
- Chrome on Windows cannot see Linux virtual devices directly — this architectural fork must be resolved early
- Fallback: Windows-side bridges (VB-Cable + OBS Virtual Camera) are acceptable if native WSL2 approach fails

### Device Naming
- Device names should be configurable via config file
- Default names: "AI Meet Agent Camera" and "AI Meet Agent Mic" (or similar branded names)
- Single virtual camera + single virtual mic (plus whatever virtual speaker/sink the audio routing needs)

### Setup Automation
- Provide both: setup script for convenience + documented manual steps for understanding
- Program checks prerequisites on startup — clear actionable error messages if something is missing (e.g. "Run: sudo modprobe v4l2loopback")
- v4l2loopback module expected to be pre-loaded (setup script handles installation, program doesn't auto-install with sudo)
- Configuration lives in a config file (JSON) in the project directory
- Virtual devices created on program start, cleaned up on exit

### Validation Approach
- Startup checks verify devices exist and report status in console
- Separate test command (`npm run test-devices` or similar) for standalone verification
- Video test: show a test pattern or the placeholder image through virtual camera
- Audio test: play a test tone through virtual mic to confirm the path works
- Errors include actionable fix commands, not just failure messages

### Claude's Discretion
- Exact v4l2loopback parameters (exclusive_caps, video format, FPS for test)
- PipeWire vs PulseAudio module choice for virtual audio devices
- Config file schema design
- Setup script implementation details
- Whether to use DKMS package or compile v4l2loopback from source

</decisions>

<specifics>
## Specific Ideas

- Virtual devices should feel "first-class" in Chrome — proper names, not "Dummy Video Device" or cryptic identifiers
- The setup experience should be smooth — if prerequisites are missing, tell the user exactly what to run
- Program should work without needing Chrome restart after device creation if possible

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no existing code

### Established Patterns
- None — first phase establishes patterns for the project
- Node.js/TypeScript runtime decided in PROJECT.md
- Config file approach decided during discussion

### Integration Points
- Virtual devices created here are consumed by Phase 2 (audio pipeline) and Phase 3 (video feed)
- Device creation/cleanup lifecycle must be accessible to the main orchestrator (Phase 5)
- Config file format established here will be used project-wide

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-virtual-device-setup*
*Context gathered: 2026-03-25*
