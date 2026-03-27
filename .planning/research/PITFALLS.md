# Pitfalls Research

**Domain:** Adding installable CLI tool, npm packaging, and AI provider abstraction to an existing Node.js/TypeScript project
**Researched:** 2026-03-26
**Confidence:** HIGH — sourced from official Node.js/npm docs, TypeScript docs, and multiple credible community sources; augmented with project-specific analysis from reading the actual codebase

---

## Critical Pitfalls

Mistakes that cause the tool to not install, not run after installation, or silently corrupt the working system.

---

### Pitfall 1: dist/ Binary Doesn't Exist When npm Tries to Link It

**What goes wrong:**
You add a `"bin"` field to `package.json` pointing to `dist/cli.js`. npm (and `npm link`) tries to `chmod` that file immediately. If `dist/` hasn't been compiled yet — or if `tsc` fails silently — npm throws an `ENOENT` error or installs a broken symlink. Running the command globally gives `command not found` or a cryptic `SyntaxError: Cannot use import statement` because the TypeScript source file was linked instead of the compiled output.

**Why it happens:**
Developers add the `"bin"` field before establishing a build gate. The dev workflow (`tsx src/index.ts`) never touches `dist/` so the gap isn't visible in development. First time someone runs `npm install -g .` or `npm link`, it fails.

**How to avoid:**
- Add a `"prepare"` script: `"prepare": "tsc"` — npm runs this automatically on `npm install` and `npm link`, guaranteeing `dist/` exists.
- Add a `"prepack"` script that verifies the binary exists: `"prepack": "tsc && test -f dist/cli.js"`.
- Test `npm link` and `ai-meet --help` as a standard phase verification step, not an afterthought.
- Never point `"bin"` at a `.ts` file — always the compiled `.js` output.

**Warning signs:**
- `npm link` succeeds but running the command gives `Error: Cannot find module` or a shebang-related SyntaxError.
- `ls dist/` shows missing or empty files after the link step.
- The `prepare` script is absent from `package.json`.

**Phase to address:** CLI entry point phase (whichever phase adds the `bin` field and subcommand structure).

---

### Pitfall 2: Missing or Wrong Shebang Line Breaks Installed Binary

**What goes wrong:**
The compiled `dist/cli.js` is missing `#!/usr/bin/env node` as its first line, or the file lacks executable permissions (`-rw-r--r--` instead of `-rwxr-xr-x`). The installed binary silently does nothing, returns `permission denied`, or opens in a text editor.

**Why it happens:**
TypeScript's compiler (`tsc`) does not add shebangs or set file permissions. It just emits `.js` files. Developers write the shebang in the `.ts` source, but `tsc` may strip or not preserve it. Alternatively, the shebang is written but the file permissions aren't set.

**How to avoid:**
- Add `#!/usr/bin/env node` as the **literal first line** of the TypeScript CLI entry file. `tsc` preserves this as a comment in the output.
- After compilation, run `chmod +x dist/cli.js`. Add this to the build script: `"build": "tsc && chmod +x dist/cli.js"`.
- Verify: after `npm link`, run `which ai-meet && head -1 $(which ai-meet)` — the shebang must be present.

**Warning signs:**
- Running the installed binary gives `Permission denied`.
- `ls -la $(which ai-meet)` shows `-rw-r--r--` instead of `-rwxr-xr-x`.
- Running `node $(which ai-meet)` works but running `ai-meet` directly doesn't.

**Phase to address:** CLI entry point phase. Must be verified in success criteria before the phase is marked done.

---

### Pitfall 3: Path Resolution Breaks When Binary Is Installed Globally

**What goes wrong:**
The existing config loader uses `import.meta.url` to walk up from `src/config/` to find the project root `config.json`:

```typescript
const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), '../../..');
```

This works perfectly in development. When the CLI is installed globally, `import.meta.url` resolves to wherever the package was installed (e.g., `/usr/local/lib/node_modules/ai-meet-agent/dist/config/loader.js`). Walking up three levels gives the npm global packages directory, not the user's current working directory. The config file is not found, or the wrong one is loaded silently.

**Why it happens:**
The distinction between "where this module lives" (`import.meta.url`) and "where the user is running the command from" (`process.cwd()`) is invisible in development because they're the same directory. Installation breaks this assumption.

**How to avoid:**
- Config lookup for an installed CLI must use `process.cwd()` as the base for user-facing files, not `import.meta.url`.
- Convention: look for `config.json` / `ai-meet.config.json` in `process.cwd()` first, then `~/.config/ai-meet/config.json` as a global fallback.
- Reserve `import.meta.url`-relative paths **only** for assets bundled with the package itself (e.g., default placeholder image, built-in templates).
- Refactor `loader.ts`: replace the `PROJECT_ROOT` derivation with `process.cwd()` for the config search path.

**Warning signs:**
- `ai-meet start` works from the project root but not from `~/Documents/meetings/`.
- Config is silently loaded from the wrong location with no warning.
- `Error: Cannot read config file at /usr/local/lib/node_modules/...` appears after global install.

**Phase to address:** CLI entry point phase. Must be tested from a directory outside the project root.

---

### Pitfall 4: Provider Abstraction Interface Designed Around Gemini's Specific Shape

**What goes wrong:**
The abstraction interface is defined by inspecting `GeminiLiveSession` and lifting its existing methods directly into a `Provider` interface. The resulting interface is `connect(apiKey, model, systemPrompt): void` + `sendAudio(buffer): void` + event emissions for `audio`, `text`, `connected`, `disconnected`. This looks provider-agnostic but is shaped entirely by how Gemini works:

- Gemini uses a persistent WebSocket (stateful session). OpenAI's Realtime API also uses WebSockets, but the session initialization, audio encoding (Gemini: base64 PCM; OpenAI: base64 PCM but different mime type fields), and event structure differ.
- Gemini reconnection is manual. OpenAI reconnection has different semantics.
- Audio format: Gemini Live outputs 24kHz PCM, internally downsampled to 16kHz. A future provider may output 8kHz, 16kHz, or compressed audio requiring different conversion.

The "abstraction" forces every future provider to pretend it works like Gemini, causing either leaky implementations or deep hacks.

**Why it happens:**
The easiest way to define an interface is to look at what you have and generalize it. The problem is that you're generalizing from a sample size of one.

**How to avoid:**
- Define the interface from the **consumer's perspective** (what `index.ts` needs from the AI layer), not from Gemini's implementation:
  - Consumer needs: start a session, stream audio in, receive audio out, receive text out, handle errors, shut down cleanly.
  - Interface: `connect(): Promise<void>`, `sendAudio(pcm16k: Buffer): void`, `disconnect(): Promise<void>`, events: `audio(Buffer)`, `text(string)`, `error(Error)`, `connected()`, `disconnected()`.
- Treat audio format normalization as the **implementation's responsibility**, not the interface's. The interface always speaks 16kHz PCM. Gemini's implementation downsamples 24kHz → 16kHz internally. OpenAI's implementation would do its own conversion.
- Validate the interface against a second provider (even a mock/stub) before the milestone is done. If the mock requires awkward workarounds, the interface is wrong.

**Warning signs:**
- The interface has a `model: string` parameter that means different things for different providers.
- Audio format is in the interface signature, not the implementation.
- Adding a mock provider for tests requires implementing Gemini-specific concepts.

**Phase to address:** Provider abstraction phase. Define and validate the interface against a stub second provider before wiring Gemini to it.

---

### Pitfall 5: Wrapping the Working GeminiLiveSession in a New Abstraction Breaks the Live System

**What goes wrong:**
The current `GeminiLiveSession` is a working, tested class that the live system depends on. Refactoring it to implement a new `AIProvider` interface involves renaming methods, changing constructor signatures, or adjusting event names. A subtle change (e.g., `disconnect()` was synchronous, now it's `async`) breaks `index.ts`'s shutdown handler. The existing unit tests don't catch the regression because they mock the old interface.

**Why it happens:**
Refactoring working code under time pressure without a safety net. TypeScript catches many breakages but not behavioral changes (async vs sync, different event timing).

**How to avoid:**
- Do **not** modify `GeminiLiveSession` directly. Introduce the new interface alongside it.
- Create `GeminiProvider` as a thin **adapter** that wraps `GeminiLiveSession` and implements the new interface. `GeminiLiveSession` stays untouched. The adapter delegates to it.
- Wire `index.ts` to use the adapter, run all existing tests, verify the live system still works before removing any old code.
- Add integration test: `GeminiProvider` passes all the same tests `GeminiLiveSession` passes.

**Warning signs:**
- `index.ts` is modified in the same commit that introduces the provider interface.
- The existing session tests are deleted or modified to fit the new interface.
- The build passes but no end-to-end verification is done.

**Phase to address:** Provider abstraction phase. Make the adapter pattern explicit in the plan.

---

### Pitfall 6: Subcommand Architecture Bakes process.exit() Into Library Code

**What goes wrong:**
The `ai-meet start` command calls `process.exit(1)` on config load failure. This is in `loadConfig()` in `config/loader.ts`. When the CLI framework calls `loadConfig()`, `process.exit()` terminates the entire process — including any cleanup the CLI framework would do, skipping graceful shutdown, and making `loadConfig()` untestable without spawning a child process.

`process.exit()` also prevents using these functions as library code in a future programmatic API.

**Why it happens:**
The current `index.ts` (single entry point) calls `process.exit()` inline. That's fine for a single-command script. When you introduce a subcommand structure with a CLI framework (Commander, etc.), those `process.exit()` calls are now buried in shared utility functions called by multiple commands, and the CLI framework has no chance to intercept them.

**How to avoid:**
- All library/utility functions (config loading, device detection, session management) must **throw errors**, not call `process.exit()`.
- Only the CLI entry point (`bin/cli.ts` / the command action handlers) calls `process.exit()` — and only after performing cleanup.
- Use Commander's `exitOverride()` to convert `process.exit()` into thrown exceptions in the framework layer, making tests possible.
- Audit every current `process.exit()` in `index.ts` and move them to the CLI command layer.

**Warning signs:**
- `loadConfig()` or any function in `src/config/`, `src/devices/`, `src/ai/` contains `process.exit()`.
- Unit tests for config loading require spawning a subprocess.
- Adding a second subcommand requires copy-pasting the same error-handling `process.exit()` blocks.

**Phase to address:** CLI subcommand phase. Establish the convention before writing any command handlers.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keep `"private": true` and use `npm link` only | Avoids packaging decisions now | Installable CLI goal is not achieved; users must clone the repo | Never — the milestone goal is an installable tool |
| Put API key directly in config.json schema | Users only need one config file | Config file committed to git leaks API key; error-prone for users | Never — API keys must stay in env vars, never config files |
| Copy `index.ts` into a `cli.ts` bin entry | Fast, avoids refactoring | Duplicate startup logic diverges over time; two places to update for every change | MVP only — must be consolidated in the same phase |
| Skip the provider interface, just add Gemini-specific config flags | Works for Gemini only, zero abstraction overhead | Adding a second provider requires rewriting `index.ts` and all config handling | Never — the milestone goal includes the abstraction |
| Use `any` types in the provider interface for streaming data | Compiles immediately | Type safety is lost; audio format bugs only surface at runtime | Never — use `Buffer` with inline format documentation |
| Hardcode `process.cwd()` config path with no override | Simple for common case | Enterprise/CI users can't specify config location; breaks `npx`-style invocation | Only if `--config` flag is also added in the same phase |

---

## Integration Gotchas

Common mistakes when connecting CLI tooling to the existing runtime components.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| CLI framework + existing `parseCliArgs()` | Keep the hand-rolled arg parser alongside Commander/yargs, causing double-parse conflicts | Remove `parseCliArgs()` from `config/loader.ts` entirely; let Commander own all arg parsing |
| `"bin"` field + `"type": "module"` | Shebang file with `require()` (CJS) in an ESM package causes `ERR_REQUIRE_ESM` | Bin file must use `import` syntax; shebang must be `#!/usr/bin/env node` with no CJS workarounds |
| `npm link` + TypeScript source maps | Debugger follows symlink into installed location, not project source | Use `"sourceRoot"` in `tsconfig.json` and ensure `declarationMap: true` for correct source navigation |
| Config loader + subcommands | Each subcommand re-runs config loading, which re-reads and re-validates the file on every invocation | Load config once in the root command's `preAction` hook; pass it via context object to subcommands |
| Provider abstraction + EventEmitter | New `AIProvider` interface uses callbacks, but existing consumers expect EventEmitter `on()` syntax | Keep the EventEmitter model — it's already used by `session.ts`, `AudioCapture`, `AudioOutput`; don't introduce callback-style just for the interface |
| Graceful error messages + Error stack traces | Error messages show raw stack traces from internal modules, confusing users | Catch at CLI command boundary; show `err.message` only; log full stack to a log file or behind `--verbose` flag |

---

## Performance Traps

For a CLI tool and provider abstraction, performance traps are about startup time and session management, not throughput scale.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Importing all provider implementations at startup | `ai-meet list-devices` takes 2s because it loads Gemini WebSocket client | Use lazy imports: `const { GeminiProvider } = await import('./providers/gemini.js')` only when a session is started | Immediately on any subcommand that doesn't need the AI layer |
| Config validation running `fs.readFileSync` synchronously in module scope | Slow startup on network filesystems; blocks event loop during initialization | Call `loadConfig()` only inside command action handlers, not at module load | On network-mounted home directories (common in corporate/CI environments) |
| Provider adapter allocating a new EventEmitter per audio chunk | Memory pressure during long calls (60+ min) causes GC pauses in the audio path | Reuse the existing EventEmitter; do not wrap chunks in objects | After ~30 minutes of continuous audio streaming |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Including `.env` or `config.json` with API key in `"files"` array when publishing | API key published to npm registry — visible to everyone | Add `.env`, `config.json`, `*.env` to `.npmignore`. Never put secrets in config schema defaults. |
| Logging config object at startup | `GEMINI_API_KEY` appears in terminal output and shell history | Only log non-sensitive config fields (device names, model ID, platform). Never log the full config object. |
| Accepting `--api-key` as a CLI flag | API key visible in `ps aux`, shell history, and CI logs | Reject this pattern. API key must come from environment variable only. Document this explicitly. |
| Config file world-readable in default location | Other users on shared system can read meeting notes and persona config | Document that `~/.config/ai-meet/config.json` should be `chmod 600`. Warn at startup if the file is group/world-readable. |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Subcommand fails with an unhelpful message when a dependency is missing (`ffmpeg`, PulseAudio) | User has no idea what to install or why it failed | Every dependency check failure message must name the missing tool, explain what it's for, and give the install command (`sudo apt install ffmpeg`) |
| `ai-meet start` exits immediately on first error instead of trying to degrade gracefully | User cannot start a call if any non-critical component (monitor, video feed) fails | Critical path (audio + AI) must succeed; non-critical components (video feed, operator monitor) warn and continue |
| No indication that the system is ready vs. still initializing | User selects virtual devices in Meet before the audio pipeline is running | Print a clear "=== System Ready ===" banner only after all critical-path components have started successfully |
| Config file format errors shown as raw Zod error objects | `ZodError: [{ code: 'invalid_type', expected: 'number', received: 'string', path: ['audio', 'relayPort'] }]` is confusing | Format Zod errors into plain English: `config.json: 'audio.relayPort' must be a number (got "19876" as a string)` |
| `--help` on the root command doesn't list available subcommands | User has to guess what subcommands exist | Use Commander's built-in help with one-line descriptions for every subcommand |

---

## "Looks Done But Isn't" Checklist

Things that appear complete in development but are missing critical pieces for an installable tool.

- [ ] **Global install:** `npm install -g .` works and `ai-meet --help` runs from any directory — not just the project root
- [ ] **Config path:** Config loads from `process.cwd()` (user's directory), not from the package install location
- [ ] **Shebang + permissions:** `head -1 dist/cli.js` shows `#!/usr/bin/env node` and `ls -la $(which ai-meet)` shows `rwxr-xr-x`
- [ ] **API key not in config:** `cat ~/.config/ai-meet/config.json` contains no API key field; key only comes from `GEMINI_API_KEY` env var
- [ ] **Provider interface tested with stub:** A `MockProvider` implements `AIProvider` and passes the same behavioral tests as `GeminiProvider` — verifying the interface is actually provider-agnostic
- [ ] **No process.exit in library code:** `grep -r "process.exit" src/` shows exits only in `src/cli/` (command handlers), nowhere else
- [ ] **Subcommands don't conflict with existing parseCliArgs:** Old hand-rolled arg parser is removed; Commander is the sole arg parsing system
- [ ] **Error messages are actionable:** Every `throw new Error(...)` in config/device/session code has a "what to do" hint, not just "what went wrong"
- [ ] **prepare script:** `npm link` in a clean checkout compiles TypeScript and produces `dist/` before linking — no manual `npm run build` required

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Bin points to non-existent dist file | LOW | Add `"prepare": "tsc"` to `package.json`, run `npm link` again |
| Missing shebang | LOW | Add `#!/usr/bin/env node` to CLI entry .ts file, rebuild, re-link |
| Path resolution broken after global install | MEDIUM | Replace `import.meta.url`-based root resolution in `loader.ts` with `process.cwd()`; add `--config` flag for explicit override; retest from multiple directories |
| Provider interface leaks Gemini-specifics | MEDIUM | Redefine interface from consumer perspective; create adapter; update wiring in `index.ts`; verify with mock provider |
| process.exit in library code | LOW-MEDIUM | Extract process.exit calls to CLI command handlers; change library functions to throw; add tests for the error cases |
| API key in config schema | HIGH | Rotate the key immediately; remove from schema defaults and any committed config files; add to `.npmignore` and `.gitignore`; document env-var-only approach |
| Working GeminiLiveSession broken by abstraction refactor | MEDIUM-HIGH | Revert abstraction changes; apply adapter pattern (wrap without modifying); re-test live system before re-attempting |

---

## Pitfall-to-Phase Mapping

How roadmap phases for v1.1 should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| dist binary missing at link time | CLI entry point phase | `npm link && ai-meet --help` passes from a non-project directory |
| Missing shebang / wrong permissions | CLI entry point phase | `head -1 $(which ai-meet)` shows shebang; `ls -la` shows executable bit |
| Path resolution breaks globally | CLI entry point phase | `cd /tmp && ai-meet --config ./test-config.json start` resolves config correctly |
| Provider interface too Gemini-specific | Provider abstraction phase | `MockProvider implements AIProvider` compiles and passes behavioral tests without workarounds |
| Wrapping session breaks live system | Provider abstraction phase | All existing session tests pass after wrapping; `npm run dev` still works end-to-end |
| process.exit in library code | CLI subcommand phase | `grep -r "process.exit" src/config src/ai src/audio src/devices` returns no matches |
| API key security | Config/error handling phase | No API key field in ConfigSchema; `--api-key` flag is explicitly rejected; `.npmignore` excludes env files |
| Unhelpful error messages | Config/error handling phase | Run each known failure scenario (missing dep, bad config, no API key) and verify message names cause and fix |

---

## Sources

- npm bin field and ENOENT on missing files: [npm/cli issue #2632](https://github.com/npm/cli/issues/2632) and [npm/npm issue #4668](https://github.com/npm/npm/issues/4668) — HIGH confidence
- TypeScript not setting executable permissions: [microsoft/TypeScript issue #37583](https://github.com/microsoft/TypeScript/issues/37583) — HIGH confidence
- ESM shebang and bin field in TypeScript: [lirantal.com: TypeScript in 2025 with ESM and CJS npm publishing](https://lirantal.com/blog/typescript-in-2025-with-esm-and-cjs-npm-publishing) — HIGH confidence
- import.meta.url path resolution and __dirname alternatives: [LogRocket: Alternatives to __dirname in Node.js ESM](https://blog.logrocket.com/alternatives-dirname-node-js-es-modules/) — HIGH confidence
- process.exit() in library code: [Commander.js exitOverride() documentation](https://betterstack.com/community/guides/scaling-nodejs/commander-explained/) — MEDIUM confidence
- Leaky provider abstractions: [The Law of Leaky Abstractions](https://khalilstemmler.com/wiki/leaky-abstraction/) — HIGH confidence (pattern is well-established)
- npm secrets leakage via npmignore: [lirantal.com: avoid leaking secrets to npm registry](https://lirantal.com/blog/2019-03-05_avoid-leaking-secrets-to-npm-registry) — HIGH confidence
- Gemini Live API vs OpenAI Realtime API shape differences: [Gemini Live API docs](https://ai.google.dev/gemini-api/docs/live-api), [OpenAI compatibility note](https://ai.google.dev/gemini-api/docs/openai) — MEDIUM confidence (API shapes verified against current docs; future API changes possible)
- Project-specific: direct analysis of `src/config/loader.ts`, `src/ai/session.ts`, `src/index.ts` — HIGH confidence

---
*Pitfalls research for: CLI packaging, provider abstraction, and npm installable tool (v1.1 milestone)*
*Researched: 2026-03-26*
