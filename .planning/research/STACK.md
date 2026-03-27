# Stack Research

**Domain:** Node.js CLI tooling, npm packaging, AI provider abstraction
**Researched:** 2026-03-26
**Confidence:** HIGH

## Scope Note

This replaces the v1.0 initial research. The existing validated stack is NOT re-researched:

- Node.js >=22, TypeScript 5.4+, tsx dev runner
- @google/genai ^1.46.0 (Gemini Live API)
- fluent-ffmpeg, Zod, v4l2loopback, PulseAudio, WSL2 bridge

This document covers ONLY additions needed for v1.1: installable CLI tool, file-based config, graceful error handling, AI provider abstraction.

---

## Recommended Stack Additions

### Core: CLI Framework

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| commander | ^14.0.3 | Subcommand routing, help generation, option validation | Industry standard (62M weekly downloads). v14.0.3 is current (Jan 2026); v14 requires Node >=20, matching our >=22 constraint. Nested subcommands, option/command groups in help, no external dependencies, native TypeScript types. |

Commander is the right choice over yargs (verbose API, middleware model adds complexity for our use case) and oclif (framework-level, designed for plugin ecosystems — overkill for a single binary). The project already has `src/cli/test-devices.ts` — commander slots directly into that approach.

### Core: Build Tool for Distribution

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| tsdown | ^0.14.0 | Bundle TypeScript to distributable JS; auto-handles shebang, ESM output | tsup is no longer actively maintained (last meaningful update was tsup 8.5.1; maintainers now direct users to tsdown). tsdown is the Rolldown-powered successor from the void(0)/Vite team. ESM-first by design (matches `"type": "module"`), auto-detects hashbang comments in entry files and marks output as executable. |

**Why a bundler is needed at all:** The current `tsx`-based dev shebang (`#!/usr/bin/env -S npx tsx`) requires tsx to be installed on the consumer's machine. For `npm install -g` and `npx` distribution, the output must be plain JS with `#!/usr/bin/env node`. A bundler also tree-shakes unused code and eliminates the runtime tsx dependency for end-users.

### Core: File-Based Config Discovery

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| cosmiconfig | ^9.0.0 | Discover and load `ai-meet.config.yml`, `ai-meet.config.json`, or config in `package.json` | Handles search-and-load across all standard config file locations. v9.0.0 (Nov 2024) adds: XDG-compliant global config paths on Linux, `$import` for config inheritance, native async/ESM loading. YAML support is built-in — no extra loader needed. |

v9's default search strategy is `none` (current directory only, no traversal). Use `searchStrategy: 'project'` to restore git-root traversal behavior, which is appropriate for our use case (per-project config discovery).

### Core: Meeting Notes / Role File Parsing

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| yaml | ^2.7.0 | Parse `--notes meeting-brief.yaml` and `--role persona.yaml` files | Ships its own TypeScript types (no `@types/yaml`). No external dependencies. Full YAML 1.2 spec support. The `yaml` package (eemeli) is preferred over `js-yaml` specifically because of first-party types and broader spec coverage. |

**Scope boundary:** cosmiconfig handles structured device/AI config (what is currently in `src/config/schema.ts`). `yaml` handles freeform prose documents passed via flags — meeting context briefs and persona definitions that users write in their own style.

### Core: CLI Output and UX

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| chalk | ^5.3.0 | Colored terminal output for errors, warnings, status | v5.6.2 is current. ESM-only since v5.0.0, compatible with `"type": "module"`. Auto-detects color support (NO_COLOR, TERM, CI environments). Needed to make error messages actionable — red for fatal errors, yellow for missing dependencies, green for successful startup. |
| ora | ^9.3.0 | Spinner feedback during device initialization and AI connection | v9.3.0 is current. ESM-only (compatible). Shows "Initializing virtual devices..." and "Connecting to Gemini..." during the multi-second startup sequence. Handles TTY detection — silently degrades in non-interactive contexts (CI, pipes). |

### AI Provider Abstraction: No New Library Needed

The provider abstraction is a TypeScript design pattern, not a library addition.

**Why NOT Vercel AI SDK:** The Vercel AI SDK (`ai` package) abstracts text and speech generation via request/response patterns. It does not support Gemini Live API's bidirectional WebSocket streaming (GitHub issue #4082, open as of March 2026). Our audio pipeline is real-time PCM over persistent WebSocket — adding the AI SDK would require replacing the working audio pipeline with a regression in capability.

**The right approach:** Define an `AIProvider` interface in `src/ai/types.ts`, implement `GeminiProvider` wrapping the existing `GeminiLiveSession`, export a `createProvider(config)` factory from `src/ai/index.ts`. Pure TypeScript, zero new dependencies.

---

## Supporting Libraries Summary

| Library | Version | Purpose | Required? |
|---------|---------|---------|-----------|
| commander | ^14.0.3 | `ai-meet start`, `ai-meet list-devices`, `ai-meet test-audio` | Required |
| tsdown | ^0.14.0 | `npm run build` → `dist/cli.js` for distribution | Required |
| cosmiconfig | ^9.0.0 | Load `ai-meet.config.yml` / per-project config | Required |
| yaml | ^2.7.0 | Parse `--notes` and `--role` freeform files | Required |
| chalk | ^5.3.0 | Actionable error messages with color | Required |
| ora | ^9.3.0 | Startup progress spinner | Recommended |

---

## Development Tools (additions)

| Tool | Purpose | Notes |
|------|---------|-------|
| tsdown | Distribution build (`npm run build`) | Dev dependency only; end-users get plain JS |
| `npm link` | Test global install locally during dev | `npm link` → `ai-meet start`; `npm unlink -g ai-meet-agent` when done |

The existing `tsx` dev runner is retained as-is for `npm run dev`. tsdown is build-only and does not affect the development workflow.

---

## Installation

```bash
# Runtime dependencies
npm install commander cosmiconfig yaml chalk ora

# Dev dependency (build only)
npm install -D tsdown
```

---

## package.json Changes Required

Three changes needed to turn the private app into an installable CLI:

```json
{
  "name": "ai-meet-agent",
  "private": false,
  "bin": {
    "ai-meet": "./dist/cli.js"
  },
  "exports": {
    ".": "./dist/index.js"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsdown src/cli.ts --format esm --out-dir dist"
  }
}
```

**Critical:** Remove `"private": true` to enable `npm publish` and `npm install -g`. The `bin` field wires the `ai-meet` command to the built output. The entry file `src/cli.ts` must have `#!/usr/bin/env node` as its literal first line — tsdown detects this and marks the output as executable automatically.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| commander | yargs | When you need middleware-style option processing or coerce functions on positional arguments |
| commander | oclif | When building a plugin-based CLI framework with multiple contributors and extensibility requirements |
| tsdown | tsup | tsup is no longer actively maintained — no reason to choose it for new work |
| tsdown | esbuild directly | When tsdown's preset behavior doesn't cover a specific edge case in the build pipeline |
| tsdown | tsc only | Only if the binary has no external deps to bundle and you manually handle shebang injection |
| cosmiconfig | manual `fs.readFile` | Only if exactly one config file location is acceptable and no discovery logic is needed |
| yaml (eemeli) | js-yaml | js-yaml is fine but requires `@types/js-yaml` separately; the `yaml` package is TypeScript-first |
| chalk | kleur | kleur is lighter, but chalk has better ecosystem integration and color support auto-detection |
| ora | cli-spinners | cli-spinners is raw spinner frame data; ora is the complete component — use ora unless building custom spinner logic |
| Manual AIProvider interface | Vercel AI SDK | Only if/when the AI SDK adds bidirectional streaming WebSocket support for Gemini Live API |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Vercel AI SDK (`ai` package) | Does not support Gemini Live API's bidirectional WebSocket streaming (GitHub issue #4082 open). Adding it would require replacing the working audio pipeline. | Manual `AIProvider` TypeScript interface wrapping `@google/genai` |
| tsup | No longer actively maintained; maintainers redirect to tsdown | tsdown |
| ts-node | Heavier than tsx, slower startup, historically worse ESM support, effectively superseded | tsx (already in project) |
| chalk v4 | v4 is the CJS version; project uses `"type": "module"`, so v4 would be a version downgrade. v5 (ESM) is the correct choice. | chalk ^5.3.0 |
| cosmiconfig-typescript-loader | Only needed for `.config.ts` TypeScript config files. Our config format is YAML/JSON — this extra loader is unnecessary. | cosmiconfig alone |
| inquirer / clack / prompts | Config comes from files and flags, not interactive prompts. Interactive prompts break scripted use and automation. | File-based config + clear chalk-formatted error messages with fix instructions |
| `dotenv` (direct calls in app code) | tsx `--env-file=.env` already handles env loading for dev; API keys stay in environment for production. Adding `dotenv` calls in production code couples the app to file-based secrets. | Environment variables via shell / process environment |

---

## Stack Patterns by Scenario

**`ai-meet start --notes brief.yaml --role persona.yaml`:**
1. commander parses flags, validates required args
2. cosmiconfig finds and loads `ai-meet.config.yml` from project root
3. Zod validates the merged config (already in place in `src/config/`)
4. yaml reads `brief.yaml` and `persona.yaml` into strings
5. ora shows "Initializing devices..." while virtual devices start
6. chalk formats any startup failures with actionable fix text
7. AIProvider interface routes to GeminiProvider

**`ai-meet list-devices`:**
1. commander routes to list-devices subcommand
2. No config loading required — runs device enumeration directly
3. chalk formats the output table (device names, indices, status)

**`ai-meet test-audio`:**
1. commander routes to test-audio subcommand (replaces current `test-devices.ts` script)
2. ora shows test progress
3. chalk reports pass/fail per device

**For global install / npx:**
1. User runs `npm install -g ai-meet-agent` or `npx ai-meet-agent start`
2. npm resolves `bin.ai-meet` → `dist/cli.js`
3. `#!/usr/bin/env node` shebang means no tsx required on consumer machine
4. All deps are bundled by tsdown

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| commander@14.x | Node.js >=20 | Matches project's `engines.node: >=22` requirement |
| chalk@5.x | `"type": "module"` | ESM-only; project already has `"type": "module"` — no conflict |
| ora@9.x | `"type": "module"` | ESM-only; compatible |
| cosmiconfig@9.x | Node.js >=18 | Compatible with >=22 |
| yaml@2.x | Node.js >=14 | Compatible with >=22; ships TypeScript types |
| tsdown@0.14.x | TypeScript >=5.0 | Compatible with project's TypeScript ^5.4.0 |

---

## Sources

- [commander npm](https://www.npmjs.com/package/commander) — v14.0.3 current, Node.js >=20 requirement (HIGH)
- [GitHub: tj/commander.js releases](https://github.com/tj/commander.js/releases) — v14 changelog; v15 planned May 2026 (HIGH)
- [tsdown official docs](https://tsdown.dev/guide/) — ESM-first, Rolldown-powered, tsup migration guide (HIGH)
- [tsdown GitHub: rolldown/tsdown](https://github.com/rolldown/tsdown) — confirmed tsup no longer maintained, tsdown as successor (HIGH)
- [cosmiconfig v9.0.0 release](https://github.com/cosmiconfig/cosmiconfig/releases/tag/v9.0.0) — Nov 2024 release, XDG support, YAML built-in (HIGH)
- [tsx shell scripts docs](https://tsx.is/shell-scripts) — shebang support, `#!/usr/bin/env -S npx tsx` pattern (HIGH)
- [chalk releases: chalk/chalk](https://github.com/chalk/chalk/releases) — v5.6.2 current, ESM-only since v5.0.0 (HIGH)
- [ora npm](https://www.npmjs.com/package/ora) — v9.3.0 current, ESM-only (HIGH)
- [yaml npm](https://www.npmjs.com/package/yaml) — TypeScript-first, no external deps (HIGH)
- [Vercel AI SDK GitHub issue #4082](https://github.com/vercel/ai/issues/4082) — Gemini Live API not supported in AI SDK (MEDIUM — issue open as of research date)
- WebSearch "tsup current version npm 2026" — tsup 8.5.1 confirmed, maintainers recommend tsdown (MEDIUM)

---

*Stack research for: CLI tooling, npm packaging, file-based config, AI provider abstraction*
*Researched: 2026-03-26*
