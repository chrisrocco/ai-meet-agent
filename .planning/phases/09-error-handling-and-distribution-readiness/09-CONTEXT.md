# Phase 9: Error Handling and Distribution Readiness - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Actionable error messages at every critical failure point (missing deps, bad config, AI/audio failures) and package ready for `npm install -g` distribution. No new features — this is polish and packaging over the existing CLI from Phase 8.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

User deferred all gray areas to Claude's judgment with the guidance: **"Use your best judgement, but keep good docs."**

The following areas are all Claude's discretion:

**Error message tone:**
- How errors read to the operator (terse vs friendly)
- Fix hint format and content
- Whether to use chalk coloring for errors/warnings
- Currently: inconsistent mix of raw `throw new Error()` and `console.error` + `process.exit(1)`

**Failure classification:**
- Which failures are fatal (exit with code) vs degraded (warn + continue)
- Currently in start.ts: audio/AI = fatal, video/monitor = degraded
- Should formalize this pattern across all startup paths
- AgentError subclasses from Phase 7 provide the typed hierarchy

**Distribution scope:**
- What "ready for npm install -g" means beyond the bin field (already working from Phase 8)
- README with installation and usage docs
- config.example.json for first-time users
- .npmignore to exclude planning/test files from published package
- License file

**Dependency checks:**
- Which external deps to validate at startup (ffmpeg, pactl, VB-Cable)
- How to surface missing deps with install instructions per platform
- Currently: DeviceManager.checkPrerequisites() checks some, others crash at runtime with raw errors
- DependencyError from Phase 7 is the right error class

**Documentation:**
- User wants good documentation throughout — JSDoc, README, inline comments where non-obvious

</decisions>

<specifics>
## Specific Ideas

- "Keep good docs" — prioritize README with clear install/usage/troubleshooting, JSDoc on error utilities, config.example.json with comments

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/errors/index.ts`: AgentError + ConfigError, DependencyError, AISessionError, AudioPipelineError from Phase 7
- `src/cli/commands/start.ts`: Main command handler with existing try/catch structure
- `src/devices/prerequisites.ts`: `checkPrerequisites()` + `printPrereqStatus()` — existing dep checking
- `src/config/loader.ts`: Zod validation that currently throws raw error format

### Established Patterns
- AgentError hierarchy carries `.message`, `.hint`, `.exitCode`
- Start command already has critical vs degraded try/catch blocks
- DeviceManager prints fix commands for missing prereqs (partial pattern to formalize)

### Integration Points
- `src/cli/commands/start.ts`: Where errors surface to the user — catch AgentError, format, exit
- `src/config/loader.ts`: Zod validation errors need human-readable formatting
- `src/devices/prerequisites.ts`: Dependency checks need DependencyError with fix hints
- `package.json`: .npmignore, license, repository field, keywords
- Root: README.md, config.example.json, LICENSE

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-error-handling-and-distribution-readiness*
*Context gathered: 2026-03-26*
