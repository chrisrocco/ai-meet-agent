# Phase 8: CLI Entry Point and Subcommands — Research

**Researched:** 2026-03-26
**Status:** Complete

## Executive Summary

Phase 8 transforms the `npm run dev` workflow into an installable `ai-meet` CLI binary with Commander.js subcommands. The codebase is well-structured for this migration: `src/index.ts` contains the startup orchestration (migrate to `start` command), `src/cli/test-devices.ts` contains device verification (migrate to `test-audio` command), and `src/config/loader.ts` has `parseCliArgs()` which will be replaced by Commander option parsing. The main technical challenges are: (1) path resolution when installed globally vs locally, (2) WSL2 device enumeration for `list-devices`, and (3) the build/packaging pipeline for the bin entry point.

## Stack & Dependencies

### Commander.js (HIGH confidence)

- **Package:** `commander` (npm) — the de facto Node.js CLI framework
- **Current version:** 13.x (ESM native support)
- **Why:** Declarative subcommand definitions, auto-generated `--help`, type-safe option parsing, `.version()` built-in
- **Alternative considered:** `yargs` — heavier, Commander is more natural for subcommand-based CLIs
- **Integration:** ESM import `import { Command } from 'commander';` — works with `"type": "module"` in package.json

### Build Pipeline (MEDIUM confidence)

**Option A: tsx shebang (recommended for v1.1)**
- Use `#!/usr/bin/env tsx` shebang in `bin/ai-meet.ts`
- `tsx` is already a production dependency
- No build step needed — TypeScript runs directly
- `package.json` `bin` field: `"ai-meet": "./bin/ai-meet.ts"`
- Drawback: requires tsx installed (but it's a dependency, so npm handles it)

**Option B: tsdown/tsc compiled dist**
- Build to `dist/cli.js` with tsc (already configured)
- Shebang: `#!/usr/bin/env node` prepended to output
- More robust for global install, but adds build step
- STATE.md mentions "tsdown shebang auto-detection must be verified empirically"

**Recommendation:** Option A (tsx shebang) for simplicity. The project already depends on tsx, and `npm install -g .` will install tsx as a dependency. Add a `prepare` script that verifies tsx is available. If tsx shebang proves problematic for global install, fall back to tsc build.

### Path Resolution Fix (HIGH confidence)

**Current problem:** `src/config/loader.ts` uses:
```typescript
const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), '../../..');
```
This resolves relative to the source file location — breaks when run from `/tmp` after global install.

**Fix:** Commander provides the entry point. Config loading should accept explicit `--config` path from Commander options. Default config lookup should use `process.cwd()` (user's current directory) not project root. The `package.json` version should be read via `createRequire(import.meta.url)` or direct import.

## Codebase Analysis

### Files to Create

| File | Purpose |
|------|---------|
| `bin/ai-meet.ts` | Shebang entry point, imports `src/cli/index.ts` |
| `src/cli/index.ts` | Commander program definition, registers subcommands |
| `src/cli/commands/start.ts` | `start` command — migrated from `src/index.ts` |
| `src/cli/commands/list-devices.ts` | `list-devices` command — new |
| `src/cli/commands/test-audio.ts` | `test-audio` command — migrated from `src/cli/test-devices.ts` |

### Files to Modify

| File | Change |
|------|--------|
| `package.json` | Add `bin` field, add `commander` dependency, add `prepare` script |
| `src/config/loader.ts` | Fix PROJECT_ROOT resolution, remove `parseCliArgs()` (replaced by Commander) |
| `src/index.ts` | Reduce to re-export or redirect to CLI entry |

### Migration Map

**`src/index.ts` main() → `src/cli/commands/start.ts`:**
- All startup logic moves to `startCommand` handler
- Commander options replace `parseCliArgs()`
- `--config <path>` → `options.config`
- `--meeting <path>` becomes `--notes <path>` → `options.notes` (requirements say `--notes`)
- `--role <path>` → `options.role` (from Phase 7 role-loader)
- Error handling uses AgentError hierarchy (from Phase 7 errors/index.ts)
- `process.exit()` calls stay in command handlers (library code throws)

**`src/cli/test-devices.ts` → `src/cli/commands/test-audio.ts`:**
- Same logic, wrapped as Commander command handler
- Accepts `--config <path>` option for device config override
- Exit codes preserved (0=pass, 1=fail, 2=unexpected)

### list-devices: WSL2 Device Enumeration (MEDIUM confidence — bounded spike)

**Native Linux:** Use `pactl list sources short` and `pactl list sinks short` for audio, `v4l2-ctl --list-devices` for video. Well-understood.

**WSL2:** Three approaches for Windows device enumeration:

1. **Config echo (simplest, recommended):** Read `config.json` wsl2 section and display the configured device names. User already configured these — just show what's set. No Windows API needed.

2. **ffmpeg probe:** Run `ffmpeg.exe -list_devices true -f dshow -i dummy` from WSL2. Parses Windows DirectShow device list. Works but output parsing is fragile.

3. **PowerShell query:** Run `powershell.exe -Command "Get-CimInstance Win32_SoundDevice"`. More structured but slower and may need elevated permissions.

**Recommendation:** Option 1 (config echo) for v1.1, with a note that `list-devices --probe` could be added later to run ffmpeg enumeration. This avoids the bounded spike risk entirely.

## Architecture Decisions

### Commander Program Structure

```
ai-meet (program)
├── --version (from package.json)
├── --help (auto-generated)
├── start [options] (default command)
│   ├── --config <path>
│   ├── --notes <path>
│   ├── --role <path>
│   └── --verbose
├── list-devices [options]
│   └── --config <path>
└── test-audio [options]
    └── --config <path>
```

### Error Handling Pattern in Commands

```typescript
async function startAction(options: StartOptions): Promise<void> {
  try {
    // ... startup logic
  } catch (err) {
    if (err instanceof AgentError) {
      console.error(`Error: ${err.message}`);
      console.error(`Hint: ${err.hint}`);
      process.exit(err.exitCode);
    }
    console.error(`Unexpected error: ${(err as Error).message}`);
    process.exit(1);
  }
}
```

### Version Reading

```typescript
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pkg = require('../../package.json');
program.version(pkg.version);
```

This works from both source (tsx) and compiled (dist/) paths because `createRequire` resolves relative to the file, and package.json is always at the project root.

## Pitfalls & Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| tsx shebang fails on global install | MEDIUM | Test with `npm install -g .` from `/tmp`; fallback to tsc build |
| `import.meta.url` path resolution breaks from global | HIGH | Use `createRequire` for package.json; use `--config` flag for user config |
| `--meeting` vs `--notes` naming confusion | LOW | Use `--notes` per requirements; keep `--meeting` as hidden alias |
| Commander ESM import issues | LOW | Commander 13.x has full ESM support |
| Missing .env file when running globally | MEDIUM | Document that GEMINI_API_KEY must be set in environment; don't depend on .env file from dev script |
| WSL2 list-devices enumeration complexity | MEDIUM | Use config-echo approach; defer probing to future |

## Testing Strategy

### Unit Tests
- `src/cli/index.test.ts` — Commander program parses options correctly
- `src/cli/commands/start.test.ts` — Start handler calls correct modules with correct args
- `src/cli/commands/list-devices.test.ts` — Output format, platform detection
- `src/cli/commands/test-audio.test.ts` — Exit codes, device manager integration

### Integration Tests
- `npm install -g .` followed by `ai-meet --version` from `/tmp`
- `npx ai-meet start --help` shows all flags
- `ai-meet list-devices` outputs device list
- `ai-meet test-audio` runs verification

### What NOT to Test
- Don't test Commander's option parsing internals
- Don't test actual audio device creation (that's Phase 1-6 territory)
- Don't test Gemini API connection (mock the provider)

## Dependency Summary

| Package | Version | Purpose | Type |
|---------|---------|---------|------|
| commander | ^13.0.0 | CLI framework | production |

No other new dependencies needed. `tsx` is already a production dependency for the shebang approach.

---

## RESEARCH COMPLETE

*Phase: 08-cli-entry-point-and-subcommands*
*Researched: 2026-03-26*
