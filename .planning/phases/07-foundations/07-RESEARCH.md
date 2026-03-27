# Phase 7: Foundations - Research

**Researched:** 2026-03-26
**Domain:** TypeScript error hierarchies, interface extraction, adapter pattern, file-based config loading
**Confidence:** HIGH

## Summary

Phase 7 introduces four foundational modules that decouple the application from concrete implementations and provide structured error handling. The codebase already follows consistent patterns (EventEmitter interfaces, factory functions, Zod schemas) that serve as direct templates for each deliverable.

The typed error hierarchy replaces scattered `new Error()` + `process.exit()` calls with a single `AgentError` class hierarchy that carries `.message`, `.hint`, and `.exitCode`. The provider interface extracts the audio session contract from `GeminiLiveSession` into a `RealtimeAudioProvider` interface, enabling mock testing and future provider swaps. The `GeminiProvider` adapter wraps `GeminiLiveSession` without modifying it. The role file loader adds `--role <path>` CLI support to load persona from disk.

**Primary recommendation:** Follow the existing codebase patterns exactly — EventEmitter for the provider interface, Zod for config validation, factory function for provider creation, and the `meeting/loader.ts` pattern for file loading.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None explicitly locked — all areas deferred to Claude's discretion.

### Claude's Discretion
User deferred all gray areas to Claude's judgment with the guidance: **"Use your best judgement, and keep good docs."**

The following areas are all Claude's discretion:
- Error shape: properties, subclass hierarchy, exit code mapping
- Provider interface: method names, signatures, event contract, config abstraction
- Role file format: file format, merge behavior with Config.persona
- Adapter boundary: how much of GeminiLiveSession's API the adapter exposes vs hides
- Documentation: JSDoc comments on interfaces, clear README sections

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PROV-01 | AI session logic uses a RealtimeAudioProvider interface, not Gemini directly | Provider interface design based on GeminiLiveSession's existing EventEmitter contract; MockProvider stub pattern from AudioCapture/AudioOutput |
| PROV-02 | GeminiProvider wraps existing GeminiLiveSession without modifying it | Adapter pattern — GeminiProvider holds a GeminiLiveSession instance, delegates calls, translates types |
| CFG-03 | User can pass `--role <path>` to load persona from a file | File loader pattern from meeting/loader.ts; CLI arg parsing from config/loader.ts; merge into Config.persona fields |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| typescript | ^5.4.0 | Type system for interfaces and error classes | Already in project |
| zod | ^3.23.8 | Schema validation for role file parsing | Already used for config; consistent validation |
| node:events | built-in | EventEmitter for provider interface | Already the event pattern throughout codebase |
| node:fs | built-in | File reading for role loader | Already used in meeting/loader.ts |

### Supporting
No new dependencies required. All four deliverables are pure TypeScript using existing project dependencies.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom error classes | `verror` or `ts-results` | Overkill — project needs simple hierarchy, not monadic error handling |
| EventEmitter interface | RxJS Observable | Massive dependency for something EventEmitter does natively; codebase already standardized on EventEmitter |

**Installation:**
No new packages needed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── errors/
│   └── index.ts          # AgentError hierarchy
├── ai/
│   ├── provider.ts       # RealtimeAudioProvider interface + MockProvider
│   ├── gemini-provider.ts # GeminiProvider adapter
│   ├── session.ts         # GeminiLiveSession (UNCHANGED)
│   ├── types.ts           # Existing types (UNCHANGED)
│   └── index.ts           # Updated exports
├── config/
│   ├── role-loader.ts     # Role file loading
│   ├── loader.ts          # Updated with --role arg parsing
│   └── schema.ts          # Config schema (UNCHANGED)
└── index.ts               # Updated to use provider factory
```

### Pattern 1: Typed Error Hierarchy
**What:** Base `AgentError` class with subclasses for each error category
**When to use:** Replace every `throw new Error()` and `process.exit(N)` pattern
**Example:**
```typescript
export class AgentError extends Error {
  readonly hint: string;
  readonly exitCode: number;

  constructor(message: string, hint: string, exitCode: number = 1) {
    super(message);
    this.name = this.constructor.name;
    this.hint = hint;
    this.exitCode = exitCode;
  }
}

export class ConfigError extends AgentError {
  constructor(message: string, hint: string = 'Check your config.json') {
    super(message, hint, 2);
  }
}

export class DeviceError extends AgentError {
  constructor(message: string, hint: string = 'Run setup script') {
    super(message, hint, 3);
  }
}

export class AISessionError extends AgentError {
  constructor(message: string, hint: string = 'Check API key and network') {
    super(message, hint, 4);
  }
}

export class AudioPipelineError extends AgentError {
  constructor(message: string, hint: string = 'Check PulseAudio setup') {
    super(message, hint, 5);
  }
}
```

### Pattern 2: Provider Interface (EventEmitter-based)
**What:** Abstract interface matching the consumer's needs, not Gemini's API
**When to use:** Any realtime audio AI provider
**Example:**
```typescript
export interface RealtimeAudioProvider extends EventEmitter {
  connect(): Promise<void>;
  sendAudio(pcm16k: Buffer): void;
  disconnect(): Promise<void>;
  getState(): ProviderState;
}

// Events: 'audio', 'text', 'connected', 'disconnected', 'error', 'latency'
```

This matches exactly what `src/index.ts` calls on the session object (lines 128-183). The interface is shaped around the consumer.

### Pattern 3: Adapter Pattern (GeminiProvider)
**What:** Wraps GeminiLiveSession, implements RealtimeAudioProvider
**When to use:** Adapt vendor-specific session to generic provider interface
**Example:**
```typescript
export class GeminiProvider extends EventEmitter implements RealtimeAudioProvider {
  private session: GeminiLiveSession;

  constructor(config: GeminiProviderConfig) {
    super();
    this.session = new GeminiLiveSession({...});
    // Forward events from session to provider
    this.session.on('audio', (buf) => this.emit('audio', buf));
    // ... etc
  }

  async connect(): Promise<void> { return this.session.connect(); }
  sendAudio(pcm16k: Buffer): void { this.session.sendAudio(pcm16k); }
  async disconnect(): Promise<void> { return this.session.disconnect(); }
  getState(): ProviderState { return this.session.getState(); }
}
```

### Pattern 4: File Loader (from meeting/loader.ts)
**What:** Read file, parse content, merge into config
**When to use:** Loading role files from disk
**Template:** `src/meeting/loader.ts` — readFileSync with error wrapping

### Anti-Patterns to Avoid
- **Modifying GeminiLiveSession:** The adapter MUST wrap, not extend or modify. Session.ts stays unchanged.
- **Leaking Gemini types through provider interface:** Provider types must be generic (ProviderState, not GeminiSessionState). The consumer shouldn't know it's Gemini.
- **Over-engineering the error hierarchy:** Keep it flat — one level of subclasses is enough. No need for `TransientAISessionError extends AISessionError`.
- **Making errors carry stack-only info:** Every AgentError needs a user-facing `hint` string, not just a developer `message`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema validation for role files | Custom parser with regex | Zod schema parse | Edge cases in JSON parsing, consistent with existing config pattern |
| Event forwarding in adapter | Manual addEventListener loops | Simple `session.on(event, ...)` forwarding | EventEmitter is the established pattern, keep it simple |

**Key insight:** Every pattern needed already exists in the codebase. The role loader mirrors meeting/loader.ts. The provider interface mirrors AudioCapture/AudioOutput. The factory mirrors audio/factory.ts. No novel patterns needed.

## Common Pitfalls

### Pitfall 1: Forgetting to set Error.name
**What goes wrong:** `error.name` shows "Error" instead of "ConfigError" in stack traces
**Why it happens:** ES class inheritance doesn't automatically set `name` to the subclass name
**How to avoid:** Set `this.name = this.constructor.name` in the base class constructor
**Warning signs:** Stack traces showing generic "Error" instead of typed error name

### Pitfall 2: EventEmitter type safety
**What goes wrong:** TypeScript doesn't enforce event name/payload types on EventEmitter
**Why it happens:** Node's EventEmitter is untyped by default
**How to avoid:** Define a `RealtimeAudioProviderEvents` type interface (like `GeminiSessionEvents` in types.ts) and document events in JSDoc. Don't try to make EventEmitter generic — the existing codebase uses JSDoc documentation for event contracts, stay consistent.
**Warning signs:** Emitting wrong event names or payloads without compile errors

### Pitfall 3: Role file format ambiguity
**What goes wrong:** User passes markdown file but code expects JSON, or vice versa
**Why it happens:** Supporting multiple formats without clear detection
**How to avoid:** Support both `.json` and `.md`/`.txt` — detect by extension. JSON maps to persona fields directly, markdown/text goes into `persona.instructions` or `persona.background`.
**Warning signs:** Silent empty persona when file format doesn't match parser

### Pitfall 4: Breaking existing imports
**What goes wrong:** Changing `src/ai/index.ts` exports breaks existing consumers
**Why it happens:** Adding provider exports without maintaining backward compatibility
**How to avoid:** Only ADD exports to `src/ai/index.ts`, never remove or rename existing ones
**Warning signs:** Compile errors in `src/index.ts` after modifying `src/ai/index.ts`

### Pitfall 5: import.meta.url fragility
**What goes wrong:** `PROJECT_ROOT` resolution fails when package is installed globally
**Why it happens:** `import.meta.url` points to different locations depending on how the module is loaded
**How to avoid:** For role file loading, resolve paths relative to `process.cwd()`, not `import.meta.url`. The role path comes from a CLI arg, so it should be resolved against the user's working directory.
**Warning signs:** "file not found" errors when running from a different directory

## Code Examples

### Error Hierarchy Usage
```typescript
// In config/loader.ts (replacing existing throws)
import { ConfigError } from '../errors/index.js';

// Before:
throw new Error(`Cannot read config file at ${path}: ${err.message}\nCreate a config.json in the project root.`);

// After:
throw new ConfigError(
  `Cannot read config file at ${path}: ${err.message}`,
  'Create a config.json in the project root'
);
```

### Provider Factory
```typescript
// Following the audio/factory.ts pattern
import type { RealtimeAudioProvider } from './provider.js';
import { GeminiProvider, type GeminiProviderConfig } from './gemini-provider.js';

export function createProvider(config: GeminiProviderConfig): RealtimeAudioProvider {
  return new GeminiProvider(config);
}
```

### Role File Loading
```typescript
// Following meeting/loader.ts pattern
import { readFileSync } from 'fs';
import { extname } from 'path';
import type { Config } from './schema.js';

export function loadRole(rolePath: string): Partial<Config['persona']> {
  let content: string;
  try {
    content = readFileSync(rolePath, 'utf8');
  } catch (err) {
    throw new ConfigError(
      `Cannot read role file: ${rolePath}: ${(err as Error).message}`,
      'Check the --role path exists and is readable'
    );
  }

  const ext = extname(rolePath).toLowerCase();
  if (ext === '.json') {
    // Parse JSON and validate against persona schema subset
    return JSON.parse(content) as Partial<Config['persona']>;
  }
  // Markdown/text: treat entire content as background + instructions
  return { background: content };
}
```

### MockProvider for Testing
```typescript
import { EventEmitter } from 'events';
import type { RealtimeAudioProvider, ProviderState } from './provider.js';

export class MockProvider extends EventEmitter implements RealtimeAudioProvider {
  private state: ProviderState = 'disconnected';
  readonly sentChunks: Buffer[] = [];

  async connect(): Promise<void> {
    this.state = 'connected';
    this.emit('connected');
  }

  sendAudio(pcm16k: Buffer): void {
    this.sentChunks.push(pcm16k);
  }

  async disconnect(): Promise<void> {
    this.state = 'disconnected';
    this.emit('disconnected');
  }

  getState(): ProviderState { return this.state; }

  // Test helpers
  simulateAudio(pcm: Buffer): void { this.emit('audio', pcm); }
  simulateText(text: string): void { this.emit('text', text); }
  simulateError(err: Error): void { this.emit('error', err); }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Plain `new Error()` | Typed error hierarchies with hints | Standard practice | Users get actionable fix suggestions |
| Direct SDK usage | Provider/adapter pattern | Standard practice | Testable, swappable providers |
| Hardcoded config | File-based persona loading | Standard practice | Reusable personas across meetings |

**Deprecated/outdated:**
- None relevant — this phase uses stable TypeScript patterns, no bleeding-edge APIs.

## Open Questions

1. **ProviderState type vs GeminiSessionState**
   - What we know: GeminiSessionState has 4 values: 'disconnected', 'connecting', 'connected', 'reconnecting'
   - What's unclear: Should ProviderState include 'reconnecting' or hide it as an implementation detail?
   - Recommendation: Include 'reconnecting' — it's useful for the consumer to know audio will be dropped during reconnect. Keep all 4 states.

2. **Role file JSON schema validation**
   - What we know: Config.persona has 5 fields (name, role, background, instructions, introduceOnStart)
   - What's unclear: Should JSON role files be validated with Zod, or just typed?
   - Recommendation: Use a Zod schema (subset of ConfigSchema.persona) for consistency and helpful error messages.

## Sources

### Primary (HIGH confidence)
- Project codebase analysis — `src/ai/session.ts`, `src/audio/types.ts`, `src/audio/factory.ts`, `src/meeting/loader.ts`, `src/config/loader.ts`
- TypeScript handbook — class inheritance, interface patterns
- Node.js EventEmitter documentation — event forwarding patterns

### Secondary (MEDIUM confidence)
- None needed — all patterns are standard TypeScript/Node.js

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, all patterns from existing codebase
- Architecture: HIGH - every pattern has a direct template in the codebase
- Pitfalls: HIGH - identified from actual code inspection and TypeScript fundamentals

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (stable patterns, no fast-moving dependencies)
