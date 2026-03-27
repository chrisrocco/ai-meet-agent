# Project Research Summary

**Project:** AI Meet Agent v1.1 — Cleaner API
**Domain:** CLI tooling, npm packaging, file-based config, AI provider abstraction
**Researched:** 2026-03-26
**Confidence:** HIGH

## Executive Summary

The v1.1 milestone is a well-scoped upgrade to an existing, working system. The v1.0 pipeline (Gemini Live API, virtual audio/video devices, WSL2 bridge) is validated and must not be disturbed. The work is additive: replace the private `npm run dev` entry point with an installable `ai-meet` CLI binary, add subcommand dispatch, expose file-based configuration for persona and meeting notes, and introduce a provider abstraction interface that decouples the orchestrator from Gemini-specific code. All patterns are well-understood in the Node.js ecosystem, and the research found strong, consistent guidance across sources.

The recommended approach is commander for subcommand routing, tsdown for the distribution build, cosmiconfig for config file discovery, and a hand-rolled `AISession` TypeScript interface (not Vercel AI SDK, which lacks bidirectional WebSocket streaming support per open GitHub issue #4082). The most important architectural decision is the adapter pattern for the provider abstraction: wrap `GeminiLiveSession` without modifying it, so the working live system is never broken during refactoring. The CLI layer should be a thin coordinator; all business logic stays in the modules it already lives in.

The primary risk is that adding the `bin` field, shebang, and build pipeline introduces a cluster of packaging gotchas (missing `dist/`, wrong executable permissions, `process.cwd()` vs `import.meta.url` path resolution) that are invisible in development but cause failures after global install. These must be verified explicitly — testing from a directory outside the project root is a hard requirement, not optional. The secondary risk is that the provider abstraction interface mirrors Gemini's shape rather than the consumer's needs, making future providers difficult to add. Defining the interface from the consumer's perspective and validating it with a stub prevents this.

## Key Findings

### Recommended Stack

The v1.0 foundation (Node.js >=22, TypeScript 5.4+, tsx, @google/genai, ffmpeg, Zod) is unchanged. The v1.1 additions are six targeted dependencies. Commander v14.0.3 handles CLI subcommand routing at industry-standard reliability (62M weekly downloads, native TypeScript types, Node >=20 compatible). tsdown replaces tsup (no longer maintained) as the distribution bundler — it is the Rolldown-powered successor from the Vite team, ESM-first, and auto-detects shebangs. cosmiconfig v9 handles config file discovery with XDG support and built-in YAML loading. The `yaml` (eemeli) package parses freeform `--notes` and `--role` files with first-party TypeScript types. chalk and ora round out the UX for colored error messages and startup progress. The Vercel AI SDK is explicitly excluded — it does not support Gemini Live API's bidirectional WebSocket streaming.

**Core technologies:**
- commander ^14.0.3: subcommand dispatch — industry standard, zero friction for this scope
- tsdown ^0.14.0: distribution build — ESM-first, tsup successor, auto-handles shebang detection
- cosmiconfig ^9.0.0: config file discovery — XDG paths, YAML built-in, `searchStrategy: 'project'`
- yaml ^2.7.0: freeform file parsing — TypeScript-first, YAML 1.2, no external deps
- chalk ^5.3.0: colored error output — ESM-compatible, NO_COLOR and CI environment aware
- ora ^9.3.0: startup spinner — TTY-aware, degrades gracefully in non-interactive contexts
- AIProvider interface: manual TypeScript design pattern, zero new dependencies

### Expected Features

The v1.1 scope is clear: everything needed to replace `npm run dev` with `ai-meet start` as the normal workflow, plus the provider abstraction as foundational infrastructure.

**Must have (table stakes):**
- `bin` field in `package.json` + compiled shebang — without this the package is not a CLI tool
- Commander subcommand dispatch (`start`, `list-devices`, `test-audio`) — multi-function CLI without subcommands feels unstructured
- `--help` and `--version` — Commander generates these automatically from command definitions
- `--config`, `--notes` flags — expose existing `loadConfig()` and `loadMeetingContext()`; `--notes` renames the existing `--meeting` flag
- `--role <path>` flag + role file loader — new loader merging file contents into `Config.persona`
- Actionable error messages with fix hints — current inconsistency (DeviceManager has them, AI session does not) must be unified
- `RealtimeAudioProvider` interface with `GeminiLiveSession` as sole implementation

**Should have (differentiators):**
- `list-devices` subcommand — WSL2 users need exact Windows audio device names; saves trial-and-error
- `test-audio` subcommand — migration of existing `test-devices.ts` into a discoverable named command
- Consistent critical-path vs degraded error classification — formalizes the pattern partially in `index.ts`

**Defer (v2+):**
- `ai-meet init` interactive setup wizard — a config example file achieves the same outcome faster for this audience
- OpenAI Realtime API provider implementation — interface is in place; add when actually needed
- Windows-native (non-WSL2) support — different virtual device stack

### Architecture Approach

The architecture is additive. A new `src/cli/` layer sits on top of unchanged core modules. `src/cli/index.ts` wires Commander; `src/cli/commands/start.ts` extracts `main()` logic from `src/index.ts`; `list-devices.ts` and `test-audio.ts` are new thin subcommands. The provider abstraction introduces `src/ai/provider.ts` (interface) and `src/ai/gemini-provider.ts` (adapter wrapping `GeminiLiveSession` without modifying it). Error types are centralized in `src/errors/index.ts`. The role loader is a new `src/config/role-loader.ts`. Everything else — `src/audio/`, `src/devices/`, `src/video/`, `src/transcript/`, `src/monitor/`, `src/platform/` — is untouched.

**Major components:**
1. `src/cli/` (NEW) — Commander program definition, subcommand registration, shebang entry point in `bin/`
2. `src/ai/provider.ts` + `gemini-provider.ts` (NEW) — AISession interface and Gemini adapter using the adapter pattern
3. `src/errors/index.ts` (NEW) — typed AgentError hierarchy carrying user message, fix hint, and exit code
4. `src/config/role-loader.ts` (NEW) — loads `--role` markdown or JSON files into `Config.persona`
5. `src/config/loader.ts` (MODIFY) — extend `parseCliArgs` with `--notes`, `--role`; remove `process.exit()` calls

### Critical Pitfalls

1. **dist/ binary missing when npm links it** — add `"prepare": "tsc"` so `npm link` triggers compilation automatically; never point `bin` at a `.ts` file; test `npm install -g .` from a clean directory
2. **Missing shebang or wrong file permissions** — shebang must be the literal first line of the CLI entry `.ts` file; add `chmod +x dist/cli.js` to the build script; verify with `head -1 $(which ai-meet)`
3. **`import.meta.url` breaks path resolution after global install** — config lookup must use `process.cwd()` (user's working directory), not `import.meta.url` (install location); test from a directory outside the project root
4. **Provider interface mirrors Gemini's shape, not the consumer's** — define the interface from what `start.ts` actually needs; validate against a `MockProvider` stub before marking the abstraction complete
5. **`process.exit()` buried in library code** — all functions in `src/config/`, `src/ai/`, `src/devices/` must throw errors, never call `process.exit()`; exits belong only in `src/cli/` command handlers

## Implications for Roadmap

Based on the build-order dependencies identified in ARCHITECTURE.md and the pitfall-to-phase mapping in PITFALLS.md, three phases emerge naturally from the dependency graph.

### Phase 1: Foundations — Error Types, Provider Interface, Role Loader

**Rationale:** The architecture build order is explicit: `src/errors/index.ts` and `src/ai/provider.ts` have zero dependencies and are prerequisites for the CLI layer. Building them first lets Phase 2 start with typed infrastructure rather than retrofitting it afterward. The role loader is also self-contained and belongs here. This phase produces no user-visible surface but de-risks every subsequent phase.

**Delivers:** Typed AgentError hierarchy, AISession interface, GeminiProvider adapter (wrapping, not modifying, GeminiLiveSession), role file loader for `--role` flag.

**Addresses:** `--role` flag (P1), provider abstraction (P1)

**Avoids:** Provider interface shaped around Gemini's internals (validate with MockProvider here); `process.exit()` in library code (establish the throw-not-exit convention before writing command handlers)

**Research flag:** Standard patterns — no additional research needed.

---

### Phase 2: CLI Entry Point and Subcommands

**Rationale:** The CLI layer has a hard dependency on Phase 1 foundations. This phase adds the `bin` field, Commander wiring, and all subcommands. The packaging pitfalls (missing dist, shebang, path resolution) all surface here and must be verified explicitly in success criteria — not treated as obvious or assumed to work.

**Delivers:** Working `ai-meet` binary accessible via `npm link`; all subcommands functional (`start`, `list-devices`, `test-audio`); `--help`, `--version`, `--config`, `--notes`, `--role` flags on `start`; existing `src/index.ts` thin-shimed or removed; hand-rolled `parseCliArgs()` replaced by Commander.

**Uses:** commander, tsdown, `bin/ai-meet.js` shebang, cosmiconfig, yaml

**Implements:** `src/cli/index.ts`, `src/cli/commands/start.ts`, `src/cli/commands/list-devices.ts`, `src/cli/commands/test-audio.ts`

**Avoids:** Missing dist at link time (add `"prepare"` script); wrong shebang or permissions (verify with `head -1` and `ls -la`); path resolution break (test from `/tmp`); double-parse conflict (remove hand-rolled parser once Commander owns arg parsing)

**Research flag:** Standard patterns — Commander, tsdown, npm bin are all thoroughly documented. No research-phase needed.

---

### Phase 3: Error Messages, UX Polish, and Distribution Readiness

**Rationale:** Error message quality is P1 but depends on the CLI layer being complete so the full set of failure points is known. This phase also adds the distribution build pipeline (tsdown producing `dist/cli.js` with a plain Node.js shebang) and the config example file, completing the "installable tool" goal and making the package publish-ready.

**Delivers:** Actionable error messages at every critical failure point (missing deps, bad config, missing API key); Zod error display formatter; `config.example.json` shipped with the package; `"private": false` + npm publish readiness; security checklist complete (no API key in config, `.npmignore` correct, file permission warning at startup).

**Addresses:** Actionable error messages (P1), Zod formatter (P2), config example (P2)

**Avoids:** Raw stack traces reaching users; API key leakage via npm publish; config file permission issues; unhelpful messages on missing `ffmpeg` or wrong device names

**Research flag:** Standard patterns — Zod error formatting and npmignore configuration are well-documented. No research-phase needed.

---

### Phase Ordering Rationale

- Phase 1 before Phase 2: the interface and error types must exist before command handlers can be typed against them — retrofitting creates unnecessary churn
- Phase 2 before Phase 3: error message quality requires knowing all the failure points, which only exist once the CLI surface is built
- The `list-devices` WSL2 branch (enumerating Windows audio devices) is the one uncertain implementation detail in Phase 2; it should be treated as a bounded spike within that phase rather than blocking the whole phase
- All three phases are independent of the v1.0 core pipeline — the working live system is never at risk during this work

### Research Flags

All three phases use standard, well-documented patterns. No phase requires a `/gsd:research-phase` call.

- **Phase 1:** TypeScript interfaces and error class hierarchies are pure language features; no library research needed
- **Phase 2:** Commander, tsdown, npm bin packaging patterns have abundant, current documentation
- **Phase 3:** Zod error formatting and npm publish preparation are well-documented

The one item to watch: if GitHub issue #4082 (Vercel AI SDK + Gemini Live) closes before Phase 1 begins, reassess the manual interface approach. The recommendation to avoid the AI SDK still stands given the custom audio pipeline architecture, but it is worth a 5-minute check.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All library versions verified at current releases; ESM compatibility matrix confirmed; Vercel AI SDK exclusion backed by open GitHub issue |
| Features | HIGH | Existing codebase directly inspected; gaps are concrete and enumerated; no ambiguity about what exists vs what is new |
| Architecture | HIGH | Build order derived from actual dependency graph; integration points identified from real file inspection; all patterns are established |
| Pitfalls | HIGH | Six critical pitfalls sourced from official npm and TypeScript docs plus project-specific code analysis; each has concrete prevention steps and verification criteria |

**Overall confidence:** HIGH

### Gaps to Address

- **WSL2 `list-devices` implementation:** The Linux branch is straightforward (`pactl list sinks short`). The WSL2 branch — enumerating Windows audio device names — is harder. A registry query vs ffmpeg probe approach is not resolved. Treat as a bounded spike in Phase 2 planning for the `list-devices` subcommand.
- **tsdown shebang auto-detection:** STACK.md documents that tsdown auto-detects hashbang comments and marks output as executable. Verify this empirically during Phase 2 rather than assuming it works; add an explicit `chmod +x dist/cli.js` to the build script as a safety net regardless.
- **Vercel AI SDK Gemini Live support:** Issue #4082 was open as of research date. Check before starting Phase 1 to confirm the manual interface approach is still correct.

## Sources

### Primary (HIGH confidence)
- commander npm (v14.0.3 current) and GitHub releases — subcommand routing, Node >=20 requirement
- tsdown official docs (tsdown.dev) — ESM-first, Rolldown-powered, shebang handling, tsup migration
- cosmiconfig v9.0.0 release notes — XDG support, YAML built-in, searchStrategy options
- chalk/chalk GitHub releases (v5.6.2 current) — ESM-only since v5, NO_COLOR aware
- ora npm (v9.3.0 current) — ESM-only, TTY-aware degradation
- yaml npm — TypeScript-first, YAML 1.2 spec, no external deps
- npm/cli issue #2632 and npm/npm issue #4668 — bin ENOENT on missing dist file
- microsoft/TypeScript issue #37583 — tsc does not set executable permissions
- LogRocket: Alternatives to __dirname in Node.js ESM — import.meta.url vs process.cwd()
- lirantal.com: avoid leaking secrets to npm registry — npmignore patterns
- Direct codebase inspection: `src/index.ts`, `src/ai/session.ts`, `src/config/loader.ts`, `src/cli/test-devices.ts`, `src/config/schema.ts`, `src/meeting/loader.ts`, `package.json`

### Secondary (MEDIUM confidence)
- Vercel AI SDK GitHub issue #4082 — Gemini Live API bidirectional streaming not supported; open as of March 2026
- WebSearch "tsup current version npm 2026" — tsup 8.5.1 confirmed; maintainers redirect users to tsdown
- Gemini Live API docs and OpenAI compatibility note — provider API shape differences informing interface design

---
*Research completed: 2026-03-26*
*Ready for roadmap: yes*
