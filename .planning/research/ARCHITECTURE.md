# Architecture Research

**Domain:** CLI tooling, npm packaging, and provider abstraction for existing AI Meet Agent
**Researched:** 2026-03-26
**Confidence:** HIGH — existing codebase is directly inspectable; patterns are well-established in Node.js ecosystem

---

## Context: What Already Exists

The v1.0 codebase is a complete, working pipeline. This research maps only the new components and integration points for the v1.1 milestone. Do not redesign what works.

Current entry point is `src/index.ts` — a monolithic `main()` function invoked via `npm run dev`. CLI arg parsing is a minimal hand-rolled loop in `src/config/loader.ts` that understands `--config` and `--meeting` only. There is one other CLI entry point: `src/cli/test-devices.ts`, invoked via `npm run test-devices`.

---

## System Overview

### Current (v1.0) Entry Layer

```
npm run dev
    └── tsx src/index.ts [--config path] [--meeting path]
         └── main() — monolithic startup function
              ├── parseCliArgs()      src/config/loader.ts
              ├── loadConfig()        src/config/loader.ts
              ├── loadMeetingContext() src/meeting/loader.ts
              ├── DeviceManager       src/devices/index.ts
              ├── AudioCapture/Output src/audio/
              ├── GeminiLiveSession   src/ai/session.ts
              ├── TranscriptWriter    src/transcript/writer.ts
              ├── OperatorAudioMonitor src/monitor/operator-audio.ts
              └── VideoFeed           src/video/

npm run test-devices
    └── tsx src/cli/test-devices.ts
         └── standalone device verification
```

### Target (v1.1) Entry Layer

```
ai-meet <subcommand> [flags]         ← installable bin from npm link / npx
    │
    ├── ai-meet start [--config] [--notes] [--role]
    │       └── src/cli/commands/start.ts    (NEW — wraps existing main() logic)
    │
    ├── ai-meet list-devices
    │       └── src/cli/commands/list-devices.ts   (NEW)
    │
    └── ai-meet test-audio
            └── src/cli/commands/test-audio.ts     (NEW — replaces test-devices script)

src/cli/index.ts    ← NEW: Commander program definition, subcommand wiring
bin/ai-meet.js      ← NEW: shebang wrapper, points to compiled output or tsx
```

---

## Recommended Project Structure

The new components fit cleanly into the existing structure. Changes are additive.

```
src/
├── ai/
│   ├── provider.ts         NEW: AIProvider interface
│   ├── gemini-provider.ts  NEW: Gemini implementation of AIProvider
│   ├── session.ts          MODIFY: GeminiLiveSession becomes impl detail
│   ├── index.ts            MODIFY: export AIProvider interface + factory
│   ├── persona.ts          UNCHANGED
│   ├── types.ts            MODIFY: add shared AI provider event types
│   └── ...
├── cli/
│   ├── index.ts            NEW: Commander program, subcommands wired
│   ├── commands/
│   │   ├── start.ts        NEW: `ai-meet start` — extracts logic from src/index.ts
│   │   ├── list-devices.ts NEW: `ai-meet list-devices`
│   │   └── test-audio.ts   NEW: `ai-meet test-audio`
│   └── test-devices.ts     EXISTING: can be kept or folded into commands/
├── config/
│   ├── schema.ts           MODIFY: add roleFile/notesFile fields to Config
│   ├── loader.ts           MODIFY: parseCliArgs gets --notes, --role flags
│   └── role-loader.ts      NEW: load role/persona from .md or .json file
├── errors/
│   └── index.ts            NEW: typed error classes, actionable message formatting
├── audio/        UNCHANGED
├── devices/      UNCHANGED
├── meeting/      UNCHANGED
├── monitor/      UNCHANGED
├── platform/     UNCHANGED
├── transcript/   UNCHANGED
├── video/        UNCHANGED
└── index.ts      MODIFY: thin shim delegating to cli/commands/start.ts, or remove

bin/
└── ai-meet.js              NEW: shebang entry point (#!/usr/bin/env node or tsx)
```

### Structure Rationale

- **`src/cli/commands/`**: One file per subcommand. Commander wires them; each file is independently testable. Avoids a god-file.
- **`src/ai/provider.ts`**: Interface extracted from GeminiLiveSession's public contract. Gemini remains the sole implementation for now, but the abstraction is established.
- **`src/errors/`**: Centralizing error types prevents actionable-message logic from scattering across every command handler.
- **`bin/`**: Standard npm convention. The `bin` field in `package.json` points here. Separating from `src/` avoids polluting TypeScript compilation.

---

## Architectural Patterns

### Pattern 1: Commander Subcommand Registration

**What:** Commander.js organizes subcommands as discrete units. Each command file calls `program.command()` with its own options and action handler.

**When to use:** Any CLI with 2+ subcommands. Commander is the dominant choice at 35M+ weekly downloads, has excellent TypeScript types, and needs no framework scaffolding. Yargs or oclif would be overkill for this project's scope.

**Trade-offs:** Commander has no built-in help generation for complex nested commands or plugin system, but those are not needed here.

**Example:**
```typescript
// src/cli/index.ts
import { Command } from 'commander';
import { registerStart } from './commands/start.js';
import { registerListDevices } from './commands/list-devices.js';
import { registerTestAudio } from './commands/test-audio.js';

const program = new Command();
program
  .name('ai-meet')
  .description('AI virtual meeting agent')
  .version('1.1.0');

registerStart(program);
registerListDevices(program);
registerTestAudio(program);

program.parseAsync(process.argv);
```

```typescript
// src/cli/commands/start.ts
import type { Command } from 'commander';

export function registerStart(program: Command): void {
  program
    .command('start')
    .description('Start the AI meeting agent')
    .option('--config <path>', 'Path to config.json')
    .option('--notes <path>', 'Meeting notes markdown file')
    .option('--role <path>', 'Role/persona markdown or JSON file')
    .action(async (opts) => {
      // extracted from current src/index.ts main()
    });
}
```

---

### Pattern 2: AIProvider Interface with Gemini Implementation

**What:** An interface captures the public contract of the AI session — connect, sendAudio, events — without exposing Gemini internals. GeminiLiveSession becomes an implementation detail.

**When to use:** The interface should be designed now (it costs nothing) but should not over-engineer. Define only what the orchestrator actually calls. Do not add methods speculatively.

**Trade-offs:** Adds one indirection layer. The benefit is that adding OpenAI Realtime Audio or another provider later does not require touching the orchestrator or command files.

**Concrete contract (derived from current GeminiLiveSession public API):**

```typescript
// src/ai/provider.ts
import { EventEmitter } from 'events';

export interface AISessionEvents {
  audio: (pcm16k: Buffer) => void;
  text: (transcript: string) => void;
  connected: () => void;
  disconnected: () => void;
  error: (err: Error) => void;
  latency: (ms: number) => void;
}

export interface AISession extends EventEmitter {
  connect(): Promise<void>;
  sendAudio(pcmChunk: Buffer): void;
  disconnect(): Promise<void>;
  getState(): 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
}

export interface AISessionConfig {
  systemPrompt: string;
  // Provider-specific config (apiKey, model, etc.) passed separately
}

export type AIProviderFactory = (config: AISessionConfig) => AISession;
```

The `GeminiLiveSession` already satisfies this interface. The change is: the orchestrator (`start.ts`) receives an `AISession` rather than constructing `GeminiLiveSession` directly. A factory function creates the right implementation based on config.

---

### Pattern 3: Typed Error Classes with Actionable Messages

**What:** Replace scattered `process.exit(1)` calls and inline `console.error` strings with typed error classes that carry a user-facing message, an optional fix hint, and an exit code.

**When to use:** For all user-visible failure paths: missing dependencies, invalid config, missing API key, file not found, audio device unavailable.

**Trade-offs:** Minor overhead of defining classes. Large payoff in consistent formatting and testability of error messages.

**Example:**
```typescript
// src/errors/index.ts
export class AgentError extends Error {
  constructor(
    public readonly userMessage: string,
    public readonly hint?: string,
    public readonly exitCode: number = 1,
  ) {
    super(userMessage);
    this.name = 'AgentError';
  }
}

export class MissingDependencyError extends AgentError {
  constructor(dep: string, installCommand: string) {
    super(
      `Missing dependency: ${dep}`,
      `Install it with: ${installCommand}`,
      1,
    );
  }
}

export class InvalidConfigError extends AgentError {
  constructor(path: string, detail: string) {
    super(
      `Invalid config at ${path}: ${detail}`,
      'Run "ai-meet init" to generate a default config.json',
      1,
    );
  }
}
```

The top-level error handler in each command's action catches `AgentError` and prints the message + hint, then exits. Unknown errors get a stack trace (debug mode) or a generic message (default).

---

### Pattern 4: npm Installable Bin with tsx Shebang

**What:** The `bin/ai-meet.js` file uses a tsx shebang so the CLI runs TypeScript directly without a compilation step during development or for global installs via npx.

**When to use:** During development and for the global install (`npm install -g`). For production distribution, compiled output to `dist/` is preferred; the shebang can switch to `#!/usr/bin/env node` pointing at `dist/cli/index.js`.

**Trade-offs:** tsx shebang works for development and npx. A compiled dist output is faster at startup and avoids requiring tsx at runtime for published packages. For this project's current stage (internal tool, not yet published), tsx shebang is the right call.

**Example:**
```javascript
// bin/ai-meet.js (ESM, mode 755)
#!/usr/bin/env tsx
import '../src/cli/index.js';
```

```json
// package.json additions
{
  "bin": {
    "ai-meet": "./bin/ai-meet.js"
  }
}
```

After `npm link` (dev) or `npm install -g` (global), `ai-meet` is available on PATH.

---

## Integration Points

### New vs Modified vs Unchanged Components

| Component | Status | What Changes |
|-----------|--------|--------------|
| `src/cli/index.ts` | NEW | Commander program, subcommand wiring |
| `src/cli/commands/start.ts` | NEW | Extracts `main()` logic from `src/index.ts` |
| `src/cli/commands/list-devices.ts` | NEW | New subcommand |
| `src/cli/commands/test-audio.ts` | NEW | Thin wrapper over existing test-devices logic |
| `src/ai/provider.ts` | NEW | AISession interface, AIProviderFactory type |
| `src/ai/gemini-provider.ts` | NEW | Factory function that returns GeminiLiveSession as AISession |
| `src/errors/index.ts` | NEW | Typed error classes |
| `src/config/role-loader.ts` | NEW | Load role/persona from file (`--role`) |
| `bin/ai-meet.js` | NEW | Shebang entry point |
| `src/index.ts` | MODIFY (thin) | Delegates to `src/cli/commands/start.ts`, or becomes unused |
| `src/config/loader.ts` | MODIFY | `parseCliArgs` adds `--notes`, `--role` flags |
| `src/config/schema.ts` | MODIFY | No schema change needed; role/notes are CLI flags not config fields |
| `src/meeting/loader.ts` | UNCHANGED | Already handles `--notes` use case |
| `src/ai/session.ts` | UNCHANGED | GeminiLiveSession implementation stays as-is |
| `src/ai/types.ts` | MODIFY | Move shared event types to `provider.ts`, or duplicate |
| `src/audio/` | UNCHANGED | |
| `src/devices/` | UNCHANGED | |
| `src/monitor/` | UNCHANGED | |
| `src/platform/` | UNCHANGED | |
| `src/transcript/` | UNCHANGED | |
| `src/video/` | UNCHANGED | |
| `package.json` | MODIFY | Add `bin` field, add `commander` dependency |

### Internal Boundary: CLI → Core

The command files (`start.ts`, etc.) are the only new callers of core modules. They import from the same internal APIs that `src/index.ts` currently uses. No core module APIs need to change to support the CLI layer.

```
src/cli/commands/start.ts
    ├── imports: src/config/loader.ts       (loadConfig, parseCliArgs — extended)
    ├── imports: src/config/role-loader.ts  (NEW)
    ├── imports: src/meeting/loader.ts      (unchanged)
    ├── imports: src/devices/index.ts       (unchanged)
    ├── imports: src/audio/index.ts         (unchanged)
    ├── imports: src/ai/gemini-provider.ts  (NEW factory)
    ├── imports: src/errors/index.ts        (NEW)
    ├── imports: src/transcript/writer.ts   (unchanged)
    ├── imports: src/monitor/operator-audio.ts (unchanged)
    └── imports: src/video/index.ts         (unchanged)
```

### External Boundary: Provider Abstraction

The provider interface boundary is between the orchestrator (command files) and the AI session implementation. The `AIProviderFactory` type is the seam where future providers plug in.

```
src/cli/commands/start.ts
    │
    │ creates via factory
    ▼
AISession (interface from src/ai/provider.ts)
    │
    └── implemented by GeminiLiveSession (src/ai/session.ts)
        └── uses @google/genai SDK
```

A future OpenAI provider would implement `AISession` and be selected by a `config.ai.provider` field.

---

## Data Flow Changes

### CLI Startup Flow (v1.1)

```
$ ai-meet start --config config.json --notes meeting.md --role role.md
        │
        ▼
bin/ai-meet.js (shebang)
        │
        ▼
src/cli/index.ts (Commander parse)
        │
        ▼
src/cli/commands/start.ts (action handler)
        │
        ├── loadConfig(opts.config)           ← existing
        ├── loadRoleFile(opts.role)            ← NEW: merges into Config.persona
        ├── loadMeetingContext(opts.notes)     ← existing (--notes replaces --meeting flag)
        │
        ├── [error handling: AgentError caught, user-friendly message printed]
        │
        └── [rest of pipeline identical to current src/index.ts main()]
```

### Role File Loading (new `--role` flag)

```
--role role.md (markdown)  OR  --role role.json (JSON)
        │
        ▼
src/config/role-loader.ts
        │
        ├── detect file type by extension
        ├── parse: markdown → extract fields (name, role, background sections)
        │         JSON    → validate against persona schema subset
        │
        ▼
Config['persona'] (merged into loaded config, CLI flags win over config.json)
```

---

## Build Order for Implementation

Dependencies determine the order. Each step can be verified in isolation.

```
Step 1: src/errors/index.ts                    (no deps — pure TS)
  └── Verify: error classes instantiate correctly, hint/exitCode accessible

Step 2: src/ai/provider.ts                     (no deps — pure interface)
  └── Verify: GeminiLiveSession satisfies the interface structurally

Step 3: src/ai/gemini-provider.ts              (deps: provider.ts, session.ts)
  └── Verify: factory returns AISession, existing session tests still pass

Step 4: src/config/role-loader.ts             (deps: config/schema.ts)
  └── Verify: loads .md and .json role files, produces Config['persona']

Step 5: src/config/loader.ts (extend parseCliArgs)
  └── Add --notes, --role flags alongside existing --config, --meeting
  └── Verify: existing --config/--meeting flags unchanged

Step 6: src/cli/commands/start.ts             (deps: all of the above + existing core)
  └── Extract src/index.ts main() into this file
  └── Wire --notes/--role, use AISession interface, use AgentError for failures
  └── Verify: `npx tsx src/cli/commands/start.ts --help` works

Step 7: src/cli/commands/list-devices.ts      (deps: devices/, platform/)
  └── New subcommand — enumerate audio/video devices

Step 8: src/cli/commands/test-audio.ts        (deps: devices/, audio/)
  └── Adapted from existing src/cli/test-devices.ts

Step 9: src/cli/index.ts                      (deps: all commands)
  └── Commander program wiring

Step 10: bin/ai-meet.js + package.json bin field
  └── Shebang wrapper
  └── npm link to verify `ai-meet` appears on PATH

Step 11: src/index.ts (thin shim or removal)
  └── Either delegate to start command or remove and update package.json scripts
```

**Key constraint:** Step 6 (`start.ts`) must come after Steps 1–5. The provider interface (Step 2–3) and error types (Step 1) are prerequisites for the command to be cleanly implemented. Steps 7–9 are independent of each other after Step 9 (Commander wiring) brings them together.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Putting Business Logic in Commander Action Handlers

**What people do:** Write all device setup, audio wiring, and AI session logic directly inside `.action(async (opts) => { ... })` callbacks.

**Why it's wrong:** Action handlers become 200-line functions, are untestable in isolation, and cannot be called from non-Commander contexts (e.g., programmatic use, tests).

**Do this instead:** Action handlers are thin coordinators — they parse options, call a function from the command module, and handle top-level errors. The actual logic lives in a named exported function that can be called independently.

---

### Anti-Pattern 2: Duplicating Config Parsing Between Commands

**What people do:** Each command file reimplements its own config loading logic.

**Why it's wrong:** Config loading is already centralized in `src/config/loader.ts`. Duplicating it creates drift when the config schema changes.

**Do this instead:** All commands call the same `loadConfig()`. The `parseCliArgs()` helper is extended (not replaced) to handle new flags.

---

### Anti-Pattern 3: Over-abstracting the Provider Interface

**What people do:** Design the AIProvider interface for every conceivable future provider — streaming, non-streaming, text-only, function-calling, etc.

**Why it's wrong:** The interface is designed for one provider (Gemini Live) with one concrete usage pattern (realtime audio). Premature generalization produces an interface nothing can cleanly implement.

**Do this instead:** Extract only the methods the orchestrator actually calls today: `connect()`, `sendAudio()`, `disconnect()`, `getState()`, and the six events already emitted. Future providers implement this or extend it with a versioned interface.

---

### Anti-Pattern 4: Compiling TypeScript to Distribute

**What people do:** Set up a full `tsc` → `dist/` build pipeline and point `bin` at `dist/` for an internal tool.

**Why it's wrong:** Adds CI complexity and a required build step before running or testing. This tool is currently installed from source, not published to npm.

**Do this instead:** Use `#!/usr/bin/env tsx` in the bin shebang for development. Add the compiled distribution only when the package is ready for public npm publish (a future milestone). Keep `npm run build` (tsc) for type-checking only.

---

## Sources

- Direct inspection of existing codebase (`src/index.ts`, `src/ai/session.ts`, `src/config/loader.ts`, `src/cli/test-devices.ts`, `package.json`, all module indices)
- Commander.js ecosystem: [pkgpulse CLI comparison](https://www.pkgpulse.com/cli-nodejs-commander-yargs-oclif), [leapcell Commander guide](https://leapcell.io/blog/crafting-robust-node-js-clis-with-oclif-and-commander-js) — MEDIUM confidence (web sources)
- tsx shebang pattern: [tsx npm page](https://www.npmjs.com/package/tsx), [2ality ESM packaging guide](https://2ality.com/2025/02/typescript-esm-packages.html) — HIGH confidence (official/authoritative)
- TypeScript provider interface pattern: standard structural typing, training knowledge — HIGH confidence

---

*Architecture research for: AI Meet Agent v1.1 CLI tooling and provider abstraction*
*Researched: 2026-03-26*
