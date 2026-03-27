/**
 * Typed error hierarchy for AI Meet Agent.
 *
 * All library code throws AgentError subclasses instead of plain Error.
 * CLI command handlers catch AgentError and use .hint and .exitCode
 * to display actionable messages and exit cleanly.
 *
 * Exit code mapping:
 * - 1: Generic agent error
 * - 2: Configuration error (bad config file, invalid schema, bad role file)
 * - 3: Device error (missing v4l2loopback, pactl, prerequisites)
 * - 4: AI session error (API key, network, Gemini connection)
 * - 5: Audio pipeline error (PulseAudio/PipeWire, relay, capture/output)
 */

/**
 * Base error class for all AI Meet Agent errors.
 *
 * Carries a user-facing `hint` string with actionable fix suggestions
 * and an `exitCode` for CLI process exit.
 *
 * @example
 * ```typescript
 * throw new AgentError('Something broke', 'Try restarting the service');
 * ```
 */
export class AgentError extends Error {
  /** User-facing hint with actionable fix suggestion. */
  readonly hint: string;

  /** Process exit code for CLI handlers. */
  readonly exitCode: number;

  constructor(message: string, hint: string, exitCode: number = 1) {
    super(message);
    this.name = this.constructor.name;
    this.hint = hint;
    this.exitCode = exitCode;
  }
}

/**
 * Configuration error — bad config file, invalid schema, missing role file.
 *
 * Exit code: 2
 *
 * @example
 * ```typescript
 * throw new ConfigError('Cannot read config file', 'Check the path exists');
 * ```
 */
export class ConfigError extends AgentError {
  constructor(message: string, hint: string = 'Check your config.json') {
    super(message, hint, 2);
  }
}

/**
 * Device error — missing virtual devices, prerequisites not met.
 *
 * Exit code: 3
 *
 * @example
 * ```typescript
 * throw new DeviceError('v4l2loopback not loaded');
 * ```
 */
export class DeviceError extends AgentError {
  constructor(message: string, hint: string = 'Run "bash scripts/setup.sh" to install prerequisites') {
    super(message, hint, 3);
  }
}

/**
 * AI session error — API key missing, network failure, Gemini connection issues.
 *
 * Exit code: 4
 *
 * @example
 * ```typescript
 * throw new AISessionError('GEMINI_API_KEY not set');
 * ```
 */
export class AISessionError extends AgentError {
  constructor(message: string, hint: string = 'Check GEMINI_API_KEY and network connection') {
    super(message, hint, 4);
  }
}

/**
 * Audio pipeline error — PulseAudio/PipeWire issues, relay failures.
 *
 * Exit code: 5
 *
 * @example
 * ```typescript
 * throw new AudioPipelineError('parec subprocess crashed');
 * ```
 */
export class AudioPipelineError extends AgentError {
  constructor(message: string, hint: string = 'Check PulseAudio/PipeWire setup') {
    super(message, hint, 5);
  }
}
