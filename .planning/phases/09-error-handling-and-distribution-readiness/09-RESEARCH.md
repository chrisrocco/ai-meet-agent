# Phase 9: Error Handling and Distribution Readiness - Research

**Researched:** 2026-03-26
**Domain:** CLI error UX, Zod error formatting, npm distribution packaging
**Confidence:** HIGH

## Summary

Phase 9 is a polish phase over well-established patterns. The project already has a typed error hierarchy (`AgentError` + subclasses with `.hint` and `.exitCode`) from Phase 7, a working CLI from Phase 8, and prerequisite checks in `DeviceManager`. The gaps are specific: (1) config validation errors dump raw `Zod.format()` output instead of naming the bad field, (2) `DeviceManager.startup()` throws plain `Error` instead of `DeviceError` on prerequisite failure, (3) no distribution artifacts (README, LICENSE, .npmignore, config.example.json), and (4) the `private: true` flag in package.json blocks `npm publish`.

The work is almost entirely mechanical: replace raw error throws with typed AgentError subclasses, format Zod errors into human-readable field-level messages, and create distribution files. No new libraries needed.

**Primary recommendation:** Fix the three error-surface gaps (config validation, dependency checks, failure classification), then add distribution artifacts. No architectural changes required.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None explicitly locked by user.

### Claude's Discretion
User deferred all gray areas to Claude's judgment with the guidance: **"Use your best judgement, but keep good docs."**

The following areas are all Claude's discretion:
- Error message tone (terse vs friendly, fix hint format, chalk coloring)
- Failure classification (fatal vs degraded)
- Distribution scope (README, config.example.json, .npmignore, LICENSE)
- Dependency checks (which deps to validate, platform-specific install instructions)
- Documentation (JSDoc, README, inline comments)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ERR-01 | Missing dependencies (ffmpeg, VB-Cable) show actionable fix instructions | Prerequisites system exists but throws plain `Error` from DeviceManager; needs `DeviceError` with per-check fix hints |
| ERR-02 | Config validation errors name the specific field and expected value | `loadConfig()` uses `result.error.format()` which dumps raw Zod tree; need to flatten to field-level messages |
| ERR-03 | Critical failures (audio/AI) exit with clear message; degraded failures (video/monitor) warn and continue | Pattern already exists in `start.ts` but inconsistently applied; DeviceManager throws plain Error, needs formalization |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | ^3.23.8 | Config validation + error formatting | Already in project; `.flatten()` and `.issues` give field-level error access |
| commander | ^14.0.3 | CLI framework | Already in project; handles --help, --version, subcommands |
| node:test | built-in | Testing | Already used throughout project |

### Supporting
No new libraries needed. All error handling uses built-in patterns.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Zod `.flatten()` | Custom error walking | `.flatten()` is sufficient, field paths are one level deep in this schema |
| Plain console.error | chalk coloring | Adds dependency; console.error with clear formatting is sufficient for a CLI tool |

## Architecture Patterns

### Pattern 1: Zod Human-Readable Error Formatting
**What:** Transform Zod validation errors into field-level messages with expected types
**When to use:** In `loadConfig()` when `safeParse` fails
**Example:**
```typescript
// Current (raw dump):
throw new ConfigError(`Invalid config.json:\n${result.error.format()}`);

// Better (field-level):
const issues = result.error.issues.map(issue => {
  const path = issue.path.join('.');
  return `  - ${path}: ${issue.message}`;
}).join('\n');
throw new ConfigError(
  `Invalid config at ${path}:\n${issues}`,
  'Check config.json fields match the expected schema — see config.example.json'
);
```

### Pattern 2: DeviceError for Prerequisite Failures
**What:** Replace plain `throw new Error()` in DeviceManager with `DeviceError` carrying per-check fix hints
**When to use:** When `checkPrerequisites()` returns `ok: false`
**Example:**
```typescript
// Current (plain Error):
throw new Error('Prerequisites not met. Fix the issues above and try again.');

// Better (DeviceError with aggregated hints):
const failures = prereqs.checks.filter(c => !c.ok);
const fixes = failures.map(f => `  ${f.name}: ${f.fix}`).join('\n');
throw new DeviceError(
  `Missing dependencies:\n${failures.map(f => `  - ${f.name}`).join('\n')}`,
  `Install missing dependencies:\n${fixes}`
);
```

### Pattern 3: Critical vs Degraded Failure Classification
**What:** Formalize which startup failures are fatal (exit) vs degraded (warn + continue)
**When to use:** In `startSession()` try/catch blocks

| Component | Classification | Behavior |
|-----------|---------------|----------|
| Config loading | CRITICAL | Exit with ConfigError |
| Device prerequisites | CRITICAL | Exit with DeviceError |
| Audio pipeline | CRITICAL | Exit with AudioPipelineError |
| AI session | CRITICAL | Exit with AISessionError |
| WSL2 relay | DEGRADED | Warn, continue without relay |
| Operator monitor | DEGRADED | Warn, continue without monitor |
| Video feed | DEGRADED | Warn, continue without video |

### Pattern 4: Top-Level AgentError Catch in CLI
**What:** Single catch at command level formats all AgentError subclasses uniformly
**Already exists in `start.ts`:**
```typescript
if (err instanceof AgentError) {
  console.error(`\nError: ${err.message}`);
  console.error(`Hint: ${err.hint}`);
  process.exit(err.exitCode);
}
```
This pattern is correct and already covers ERR-03 for the exit-with-clear-message requirement.

### Anti-Patterns to Avoid
- **Throwing plain `Error` in library code:** Always use AgentError subclasses so CLI catch works
- **Logging errors before throwing:** The CLI catch handles formatting; library code should throw, not log
- **Using `console.error` + `process.exit` in library code:** Only CLI command handlers should exit

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Zod error formatting | Custom AST walker | `ZodError.issues` array | Built-in, gives path + message + expected type |
| npm package metadata | Manual file copying | package.json `files` field + .npmignore | npm handles inclusion/exclusion natively |

## Common Pitfalls

### Pitfall 1: Zod format() vs flatten() vs issues
**What goes wrong:** Using `.format()` produces a deeply nested object dump that's unreadable to users
**Why it happens:** `.format()` preserves the full schema tree structure
**How to avoid:** Use `.issues` array directly — each issue has `.path` (field location), `.message` (human text), and `.code` (error type)
**Warning signs:** Error output contains `_errors` keys or nested braces

### Pitfall 2: Missing private:true removal for npm publish
**What goes wrong:** `npm publish` silently refuses with "private" package
**Why it happens:** package.json has `"private": true` as a safety net
**How to avoid:** Remove `private: true` or set to `false` before publishing. Also ensure `bin` entry points to compiled JS (not .ts) for non-tsx environments
**Warning signs:** `npm pack --dry-run` shows nothing or errors

### Pitfall 3: bin entry pointing to TypeScript
**What goes wrong:** `npm install -g` fails because shebang `#!/usr/bin/env tsx` requires tsx globally
**Why it happens:** bin/ai-meet.ts is TypeScript requiring tsx runtime
**How to avoid:** The `bin` field should point to a compiled JS file OR the project must list `tsx` as a dependency (already does). Since tsx is a runtime dep, the current approach works for `npm install -g`. Document this in README.
**Warning signs:** Users without tsx get "tsx: not found" errors

### Pitfall 4: .npmignore vs files field
**What goes wrong:** Publishing includes test files, planning docs, or excludes needed files
**Why it happens:** Without .npmignore, npm falls back to .gitignore which may not match
**How to avoid:** Use explicit .npmignore listing excluded dirs (.planning/, src/**/*.test.ts, test-*)
**Warning signs:** `npm pack --dry-run` shows unexpected files

## Code Examples

### Zod Issue Formatting Utility
```typescript
import { ZodError } from 'zod';

/** Format Zod validation errors as human-readable field-level messages. */
export function formatZodErrors(error: ZodError): string {
  return error.issues.map(issue => {
    const field = issue.path.join('.') || '(root)';
    return `  ${field}: ${issue.message}`;
  }).join('\n');
}
```

### config.example.json Template
```json
{
  "persona": {
    "name": "AI Assistant",
    "role": "Meeting Participant",
    "background": "Helpful AI that participates in meetings",
    "instructions": "Be concise and professional",
    "introduceOnStart": true
  },
  "ai": {
    "model": "gemini-2.5-flash-native-audio-latest"
  },
  "devices": {
    "camera": {
      "videoNr": 10
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw throw + process.exit | Typed error hierarchy | Phase 7 (current project) | CLI can catch uniformly |
| Zod .format() | Zod .issues iteration | Always available | Human-readable field errors |

## Open Questions

1. **Should `bin` point to compiled JS or keep tsx shebang?**
   - What we know: tsx is a runtime dependency, so `npm install -g` installs it alongside
   - What's unclear: Whether all environments support tsx shebang after global install
   - Recommendation: Keep tsx approach (already working), document Node 22+ requirement in README

2. **MIT or ISC license?**
   - Recommendation: MIT (most common for npm packages, user didn't specify)

## Sources

### Primary (HIGH confidence)
- Codebase analysis: src/errors/index.ts, src/config/loader.ts, src/cli/commands/start.ts, src/devices/prerequisites.ts, src/devices/index.ts, package.json
- Zod documentation: ZodError.issues API is stable and well-documented

### Secondary (MEDIUM confidence)
- npm packaging best practices: files field, .npmignore, bin conventions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries needed, all patterns exist in codebase
- Architecture: HIGH - error hierarchy and CLI catch pattern already established
- Pitfalls: HIGH - issues are concrete and observable in current code

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (stable domain, no fast-moving dependencies)
