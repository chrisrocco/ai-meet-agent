# Feature Research

**Domain:** CLI tooling, npm packaging, file-based config, graceful error handling, AI provider abstraction
**Researched:** 2026-03-26
**Milestone:** v1.1 Cleaner API — adding installable CLI, subcommands, file-based config, provider abstraction to existing AI Meet Agent
**Confidence:** HIGH (existing codebase surveyed directly; CLI/npm patterns verified via current community sources)

---

## Context: What Already Exists

These are already built in v1.0 and must not be counted as new work:

- `src/config/loader.ts` — `parseCliArgs()` (handles `--config`, `--meeting`); `loadConfig()` reads and validates `config.json` via Zod
- `src/config/schema.ts` — Full Zod schema with defaults for all config sections (devices, audio, wsl2, video, persona, ai)
- `src/meeting/loader.ts` — `loadMeetingContext()` reads meeting notes from a markdown file path
- `src/cli/test-devices.ts` — Standalone device verification script (run via `npm run test-devices`)
- `src/ai/session.ts` — `GeminiLiveSession` with reconnection, latency tracking, transient vs permanent error classification
- `src/ai/types.ts` — Gemini-specific types and constants; no shared provider interface yet
- `src/index.ts` — Single entrypoint (`npm run dev`) wiring all subsystems, with SIGINT/SIGTERM shutdown

The gaps this milestone fills: installable binary (`bin` field), subcommand dispatch, `--notes`/`--role` flags, actionable error messages with fix hints, and a provider abstraction interface.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that users of any installable CLI tool assume exist. Missing these makes the tool feel unfinished.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `bin` entry in `package.json` with shebang | Required for `npm install -g` and `npx` to create an executable; without this the package is not a CLI tool | LOW | Compiled `dist/cli.js` with `#!/usr/bin/env node`; project is ESM (`"type": "module"`), compatible |
| Subcommand dispatch (`start`, `list-devices`, `test-audio`) | Git-style subcommand UX is the de facto standard; any multi-function CLI tool without it feels unstructured | LOW | Commander.js `.command()` with action handlers; 500M weekly downloads, production standard |
| `--help` output per subcommand | All serious CLIs auto-generate help; users expect `ai-meet start --help` to describe flags | LOW | Commander generates this automatically from option definitions — zero extra work |
| `--version` flag | Standard expectation; users need to verify what version they have installed | LOW | Pulled from `package.json` via Commander's `.version()` |
| `--config <path>` flag | Already in `loadConfig()` but not surfaced as a named CLI flag | LOW | Expose existing `loadConfig(args.configPath)` through Commander option |
| `--notes <path>` flag | PROJECT.md names this `--notes`; currently implemented as `--meeting` in `parseCliArgs()` | LOW | Rename/alias; `loadMeetingContext()` already exists and works |
| Graceful exit on Ctrl+C | SIGINT/SIGTERM handler already exists in `index.ts`; must remain intact through CLI refactor | LOW | Wire existing `shutdown()` from CLI entrypoint |
| Actionable error messages with fix hints | Raw Node.js stack traces on missing `ffmpeg` or wrong device names are unusable | MEDIUM | Currently inconsistent: DeviceManager prints fix commands, AI session does not; needs a unified pattern |
| Config validation errors that name the field | Zod validates but `result.error.format()` outputs raw JSON; users need readable messages | LOW | Write a display formatter for Zod error output — small utility function |

### Differentiators (Competitive Advantage)

Features beyond baseline CLI expectations that directly serve this tool's specific use case.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `--role <path>` flag loading persona from file | Allows storing per-persona markdown files and swapping roles without editing `config.json`; enables a "role library" workflow | MEDIUM | New loader needed: reads a markdown/text file, merges fields into `Config.persona` at runtime before startup |
| AI provider abstraction interface (`RealtimeAudioProvider`) | Decouples the audio pipeline from Gemini specifically; makes adding OpenAI Realtime API a new file, not a rewrite | MEDIUM | Define interface: `connect()`, `disconnect()`, `sendAudio(chunk: Buffer)`, events (audio, text, connected, error); `GeminiLiveSession` implements it |
| `list-devices` subcommand | Users on WSL2 must know exact Windows device names to configure `config.json`; a tool that lists them saves trial-and-error debugging | LOW | Linux: shell `pactl list sinks short`; WSL2: list DirectSound devices via ffmpeg probe or registry query |
| `test-audio` subcommand | Exposes existing `test-devices.ts` logic as a discoverable named command; validates device setup before a real call | LOW | Migrate `test-devices.ts` main function into a CLI action handler |
| Consistent critical-path vs. degraded error classification | Formalizes the pattern already partially in `index.ts` (audio/AI = fatal, video/monitor = degraded); makes the behavior predictable | MEDIUM | `exitWithError(message, fixHint)` helper for fatal paths; warning logging for degraded paths |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Interactive `ai-meet init` wizard | Reduces friction for new users | Significant scope for this audience (developers); a config template file achieves the same outcome faster | Ship `config.example.json`; document in README |
| Plugin system for AI providers | "What if we add 10 providers?" | Over-engineering; interface + concrete implementations with conditional instantiation handles all realistic cases | Clean interface, add providers as files, no plugin loader |
| Auto-discovery of config file (walk up directory tree) | Convenient in monorepos | Surprising behavior; this tool is a standalone process, not embedded in a workspace | `--config` flag + `config.json` convention in working directory |
| Remote config fetched from URL | Centralized config for teams | Adds network dependency and security surface at startup; not relevant to single-user use case | Local files only |
| Hot-reload config without restart | Change persona mid-call | Audio pipeline is stateful; reconnecting AI session mid-stream risks audio dropout | Restart is the correct path; session is short-lived |
| YAML config file format | YAML is more readable than JSON | Adds a parse dependency (`js-yaml`); project already uses JSON with Zod validation; no real problem this solves | Keep JSON; allow comments via JSON5 if needed later |

---

## Feature Dependencies

```
[npm bin + shebang]
    └──requires──> [TypeScript tsc build emitting dist/cli.js]
                       └──requires──> [tsconfig.json paths set for dist/ output]

[Subcommand dispatch (Commander.js)]
    └──requires──> [npm bin + shebang]
    ├──composes──> [start action] ──delegates──> [existing src/index.ts main()]
    ├──composes──> [list-devices action] ──calls──> [platform device enumeration]
    └──composes──> [test-audio action] ──calls──> [existing test-devices.ts logic]

[--notes <path> flag]
    └──already implemented as --meeting in parseCliArgs()]
    └──rename only; loadMeetingContext() unchanged]

[--role <path> flag]
    └──requires──> [new role file loader (reads file, merges into Config.persona)]
    └──merges into──> [Config.persona before DeviceManager + AI session init]
    └──depends on──> [existing ConfigSchema.persona defaults in schema.ts]

[AI provider abstraction interface]
    └──requires──> [GeminiLiveSession implements RealtimeAudioProvider interface]
    └──requires──> [index.ts typed against interface, not concrete class]
    └──enables──> [future OpenAI Realtime provider added as separate file]
    └──is independent of──> [CLI subcommand work]

[Actionable error messages]
    └──enhances──> [all subcommand action handlers]
    └──depends on──> [exitWithError() helper or equivalent convention]

[Config validation display formatter]
    └──enhances──> [loadConfig() in src/config/loader.ts]
    └──zero new dependencies; Zod already produces structured errors]
```

### Dependency Notes

- **npm bin requires a compiled build output.** The project uses `tsx` for `npm run dev` today. For installable distribution, `tsc` must emit `dist/cli.js` and the `bin` field points there. Alternatively, the shebang can invoke `tsx` for local/npx use, but that ships `tsx` as a runtime dependency — acceptable for a developer tool.
- **Provider abstraction is independent.** It can be designed and merged in any order relative to CLI or config features. No ordering constraint.
- **`--role` loader is genuinely new work.** Unlike `--notes` (existing `--meeting` renamed), role loading requires a new file: read a text/markdown file, parse it into persona fields or treat the whole content as `instructions`, and merge with `Config.persona` defaults.
- **`list-devices` is platform-branched.** On Linux it shells to `pactl`; on WSL2 it needs to enumerate Windows audio devices. The WSL2 branch is the harder half.

---

## MVP Definition

### Launch With (v1.1)

Minimum set to deliver the goal: replace `npm run dev` with `ai-meet start` as the normal workflow.

- [ ] `bin` field in `package.json` pointing to compiled CLI entrypoint — this is the milestone's entry gate
- [ ] Commander.js subcommand dispatch: `start`, `test-audio`, `list-devices`
- [ ] `--help` and `--version` (Commander auto-generates from command definitions)
- [ ] `--config <path>`, `--notes <path>`, `--role <path>` flags on `start` subcommand
- [ ] Role file loader that reads file contents and merges into `Config.persona`
- [ ] Actionable error messages with fix hints at all critical failure points (missing deps, bad config, missing API key)
- [ ] `RealtimeAudioProvider` interface with `GeminiLiveSession` as the sole implementation

### Add After Validation (v1.x)

- [ ] `config.example.json` template shipped with the package — useful once users install globally
- [ ] Zod error display formatter showing field names and human-readable messages
- [ ] OpenAI Realtime API provider implementation — only when actually needed; interface is already in place

### Future Consideration (v2+)

- [ ] `ai-meet init` interactive setup wizard
- [ ] Windows-native (non-WSL2) support — different virtual device stack
- [ ] Zoom platform support

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| npm bin + shebang | HIGH | LOW | P1 |
| Commander.js subcommand dispatch | HIGH | LOW | P1 |
| `--help` / `--version` | MEDIUM | LOW | P1 |
| `--config`, `--notes` flags (expose existing) | MEDIUM | LOW | P1 |
| `--role <path>` flag + file loader | HIGH | MEDIUM | P1 |
| `list-devices` subcommand | MEDIUM | LOW | P1 |
| `test-audio` subcommand (migrate existing) | MEDIUM | LOW | P1 |
| Actionable error messages | HIGH | MEDIUM | P1 |
| `RealtimeAudioProvider` interface | MEDIUM | MEDIUM | P1 |
| Zod error display formatter | LOW | LOW | P2 |
| `config.example.json` | MEDIUM | LOW | P2 |
| OpenAI Realtime provider implementation | LOW | HIGH | P3 |
| `ai-meet init` wizard | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for this milestone
- P2: Add when core is verified working
- P3: Future milestone

---

## Competitor Feature Analysis

This is a developer-facing internal tool. Reference CLIs from the same ecosystem:

| Feature | Reference (Vercel CLI, Railway CLI) | Our Approach |
|---------|--------------------------------------|--------------|
| Subcommand structure | `vercel deploy`, `vercel dev`, `vercel list` — Commander or Oclif | `ai-meet start`, `ai-meet list-devices`, `ai-meet test-audio` via Commander.js |
| Config file | `vercel.json` in project root, `--local-config` to override | `config.json` in project root, `--config` to override (already implemented) |
| Error messages | Specific actionable messages, sometimes with doc links | Actionable messages with fix commands, e.g., "Run bash scripts/setup.sh" |
| Provider abstraction | Not applicable (single platform) | `RealtimeAudioProvider` interface; Gemini now, extensible later |

---

## Sources

- [commander.js GitHub — 24K stars, 500M+ weekly downloads](https://github.com/tj/commander.js/)
- [Commander.js npm page](https://www.npmjs.com/package/commander)
- [Node.js CLI best practices — lirantal](https://github.com/lirantal/nodejs-cli-apps-best-practices)
- [Building TypeScript CLI with Commander — LogRocket](https://blog.logrocket.com/building-typescript-cli-node-js-commander/)
- [npm package.json bin field documentation](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/)
- [Publishing ESM TypeScript packages — 2ality 2025](https://2ality.com/2025/02/typescript-esm-packages.html)
- [LLM abstraction layer patterns — ProxAI](https://www.proxai.co/blog/archive/llm-abstraction-layer)
- [Complete guide to building developer CLI tools 2026 — DEV Community](https://dev.to/chengyixu/the-complete-guide-to-building-developer-cli-tools-in-2026-a96)
- Existing codebase (directly surveyed): `src/config/loader.ts`, `src/config/schema.ts`, `src/meeting/loader.ts`, `src/cli/test-devices.ts`, `src/ai/session.ts`, `src/ai/types.ts`, `src/index.ts`

---
*Feature research for: AI Meet Agent v1.1 — CLI tooling, file-based config, graceful error handling, AI provider abstraction*
*Researched: 2026-03-26*
