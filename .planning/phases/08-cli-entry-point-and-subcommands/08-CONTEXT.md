# Phase 8: CLI Entry Point and Subcommands - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Installable `ai-meet` binary with Commander.js subcommands (`start`, `list-devices`, `test-audio`), file-based config flags (`--config`, `--notes`, `--role`), and package.json `bin` field. Replaces `npm run dev` as the normal operator workflow. Error message polish is Phase 9 — this phase wires the structure.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

User deferred all gray areas to Claude's judgment with the guidance: **"You decide; just keep good docs."**

The following areas are all Claude's discretion:

**Command naming:**
- Binary name: `ai-meet` (established in requirements)
- Subcommand names: `start`, `list-devices`, `test-audio` (from requirements)
- Flag naming conventions (short flags, long flags, aliases)
- Whether `--meeting` becomes `--notes` (alias vs rename)

**Output style:**
- Color usage (chalk for colored output, ora for spinners)
- Startup banner format
- Verbosity levels (--verbose, --quiet flags)
- Currently: raw `console.log` with `[Module]` prefixes throughout

**list-devices behavior:**
- What devices to show (audio inputs, audio outputs, video devices)
- Format (table, list, grouped by type)
- WSL2 Windows device enumeration approach (ffmpeg probe vs registry query vs config echo)
- Research flagged WSL2 device enumeration as bounded spike

**Build & packaging:**
- tsx shebang vs compiled dist (research suggested tsdown build)
- `npm run dev` preserved as fallback for development
- `package.json` bin field configuration
- `prepare` script for build-on-install

**Documentation:**
- User wants good documentation — JSDoc on CLI modules, --help output, README updates for installation and usage

</decisions>

<specifics>
## Specific Ideas

- "Keep good docs" — prioritize clear --help output per subcommand, JSDoc on command handler functions, and README installation/usage section

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/index.ts`: Current main() — startup orchestration logic to migrate to `start` command handler
- `src/config/loader.ts`: `parseCliArgs()` + `loadConfig()` — wire into Commander options
- `src/config/role-loader.ts`: `loadRole()` — new from Phase 7, wire into `--role` flag
- `src/meeting/loader.ts`: `loadMeetingContext()` — wire into `--notes` flag
- `src/cli/test-devices.ts`: Existing device test script — migrate to `test-audio` subcommand
- `src/errors/index.ts`: `AgentError` hierarchy from Phase 7 — use in command handlers
- `src/ai/provider.ts`: `RealtimeAudioProvider` from Phase 7 — use in start command

### Established Patterns
- EventEmitter for async communication across all modules
- Factory functions for platform dispatch
- Zod schema validation with cascading defaults
- `import.meta.url` for project root (⚠️ needs fix for global install — path resolution from outside project)

### Integration Points
- `src/index.ts` main() → migrates to `src/cli/commands/start.ts`
- `src/config/loader.ts` parseCliArgs() → replaced by Commander option parsing
- `src/cli/test-devices.ts` → migrates to `src/cli/commands/test-audio.ts`
- `package.json` → add `bin` field, `prepare` script, commander dependency
- New: `src/cli/index.ts` as Commander program entry point
- New: `bin/ai-meet.js` (or dist output) as shebang entry

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-cli-entry-point-and-subcommands*
*Context gathered: 2026-03-26*
