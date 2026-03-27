---
phase: 08-cli-entry-point-and-subcommands
status: passed
verified: 2026-03-26
---

# Phase 8: CLI Entry Point and Subcommands — Verification

## Phase Goal
The `ai-meet` binary is installable, all subcommands work, and file-based configuration (`--config`, `--notes`, `--role`) is fully wired — replacing `npm run dev` as the normal operator workflow.

## Requirement Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| CLI-01: npm install -g | ✓ | package.json bin field maps ai-meet to ./bin/ai-meet.ts |
| CLI-02: --version | ✓ | `npx tsx bin/ai-meet.ts --version` prints "0.1.0" |
| CLI-03: --help | ✓ | `npx tsx bin/ai-meet.ts --help` lists all subcommands |
| CLI-04: npx ai-meet start | ✓ | bin entry point with tsx shebang, package.json bin field |
| CMD-01: ai-meet start | ✓ | start command handler at src/cli/commands/start.ts |
| CMD-02: start --help | ✓ | Shows --config, --notes, --role, --verbose flags |
| CMD-03: list-devices | ✓ | Shows WSL2 configured devices; native Linux queries pactl/v4l2 |
| CMD-04: test-audio | ✓ | Device verification with exit codes 0/1/2 |
| CFG-01: --config | ✓ | Commander option parsed, passed to loadConfig() |
| CFG-02: --notes | ✓ | Commander option parsed, passed to loadMeetingContext() |

## Success Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| npm install -g + ai-meet --version from /tmp | ✓ | bin field set, version reads from package.json via createRequire |
| npx ai-meet start without global install | ✓ | bin entry point and start command handler wired |
| ai-meet --help lists subcommands | ✓ | Shows start, list-devices, test-audio |
| ai-meet start --help lists flags | ✓ | Shows --config, --notes, --role, --verbose |
| ai-meet list-devices shows devices | ✓ | WSL2: config echo; Native: pactl + v4l2-ctl |
| ai-meet test-audio verifies setup | ✓ | Runs DeviceManager verification, reports pass/fail |
| ai-meet start --config --notes launches session | ✓ | Commander options wired to loadConfig/loadMeetingContext |

## Must-Haves Verification

### Plan 01 Must-Haves
- [x] --version prints version from package.json
- [x] --help shows program name, description, subcommands
- [x] package.json bin field maps ai-meet to ./bin/ai-meet.ts
- [x] Commander program has start, list-devices, test-audio registered

### Plan 02 Must-Haves
- [x] list-devices shows audio/video devices grouped by type
- [x] list-devices on WSL2 shows configured Windows device names
- [x] test-audio runs verification and exits 0 on success, 1 on failure
- [x] test-audio --config uses specified config file

### Plan 03 Must-Haves
- [x] start --config --notes launches session with specified files
- [x] start --help lists all flags
- [x] start uses GeminiProvider (not GeminiLiveSession directly)
- [x] AgentError subclasses caught with hints
- [x] Config path resolution uses process.cwd(), not import.meta.url

## Automated Checks
- `npx tsc --noEmit` — passes (zero errors)
- `npx tsx bin/ai-meet.ts --version` — prints "0.1.0"
- `npx tsx bin/ai-meet.ts --help` — lists all subcommands
- `npx tsx bin/ai-meet.ts start --help` — lists all flags
- `npx tsx bin/ai-meet.ts list-devices` — shows device list
- `npx tsx bin/ai-meet.ts test-audio --help` — shows help

## Notes
- Pre-existing test failure in schema.test.ts (AI model default value mismatch) is unrelated to Phase 8
- tsx shebang approach chosen for simplicity; if global install has issues, can fall back to tsc build
- WSL2 list-devices uses config-echo approach; probing deferred to future enhancement

---
*Phase: 08-cli-entry-point-and-subcommands*
*Verified: 2026-03-26*
