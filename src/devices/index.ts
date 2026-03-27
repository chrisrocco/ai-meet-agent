import { type Config } from '../config/schema.js';
import { checkPrerequisites, printPrereqStatus, type PrereqResult } from './prerequisites.js';
import { VirtualCamera } from './virtual-camera.js';
import { VirtualAudioDevices } from './virtual-audio.js';
import { detectPlatform, type Platform } from '../platform/detect.js';
import { checkWsl2Prerequisites, type Wsl2Status } from '../platform/wsl2.js';
import { DeviceError } from '../errors/index.js';

export interface DeviceStatus {
  platform: Platform;
  prerequisites: PrereqResult;
  wsl2Status?: Wsl2Status;  // present when platform === 'wsl2'
  cameraDevice: string;
  audioSinkName: string;
  audioMicName: string;
  testPatternRunning: boolean;
}

export class DeviceManager {
  private camera: VirtualCamera;
  private audio: VirtualAudioDevices;
  private config: Config;
  private platform: Platform;
  private started = false;

  constructor(config: Config, platform?: Platform) {
    this.config = config;
    this.platform = platform ?? detectPlatform();
    this.camera = new VirtualCamera(config.devices.camera.videoNr);
    this.audio = new VirtualAudioDevices();
  }

  /**
   * Check prerequisites, create virtual audio devices, and start camera test pattern.
   *
   * On WSL2: probes available capabilities, reports Windows-bridge status with actionable
   * notes, and returns successfully (does NOT throw).
   *
   * On native Linux: throws if prerequisites fail — caller must handle and display fix
   * instructions.
   */
  startup(options: { startTestPattern?: boolean } = {}): DeviceStatus {
    if (this.started) {
      throw new Error('DeviceManager: already started');
    }

    if (this.platform === 'wsl2') {
      // WSL2 path: probe available capabilities, report bridge status
      const wsl2Status = checkWsl2Prerequisites();
      console.log('\nWSL2 environment detected. Probing device capabilities...');
      for (const check of wsl2Status.checks) {
        const icon = check.ok ? '✓' : '✗';
        console.log(`  ${icon} ${check.name}${check.note ? ` — ${check.note}` : ''}`);
      }
      console.log(`\nWSL2 device path: ${wsl2Status.path}`);
      if (wsl2Status.path === 'windows-bridge') {
        console.log('Virtual devices must be set up on Windows side (OBS Virtual Camera + VB-Cable).');
        console.log('See: docs/wsl2-setup.md and scripts/setup-wsl2-windows.md');
      }
      this.started = true;
      return {
        platform: this.platform,
        prerequisites: { ok: true, checks: [] },
        wsl2Status,
        cameraDevice: 'OBS Virtual Camera (Windows)',
        audioSinkName: 'VB-Cable CABLE Input (Windows)',
        audioMicName: 'VB-Cable CABLE Output (Windows)',
        testPatternRunning: false,
      };
    }

    // Native Linux path: existing prereq checks, audio, camera unchanged

    // 1. Check prerequisites
    const prereqs = checkPrerequisites(this.config.devices.camera.videoNr);
    console.log('\nPrerequisite checks:');
    printPrereqStatus(prereqs);

    if (!prereqs.ok) {
      const failures = prereqs.checks.filter(c => !c.ok);
      const names = failures.map(f => `  - ${f.name}`).join('\n');
      const fixes = failures.filter(f => f.fix).map(f => `  ${f.fix}`).join('\n');
      throw new DeviceError(
        `Missing dependencies:\n${names}`,
        `Install missing dependencies, then retry:\n${fixes}`
      );
    }

    // 2. Create virtual audio devices
    this.audio.create(
      this.config.devices.sink.sinkName,
      this.config.devices.sink.label,
      this.config.devices.mic.sinkName,
      this.config.devices.mic.label
    );

    // 3. Optionally start camera test pattern
    if (options.startTestPattern) {
      this.camera.startTestPattern();
      console.log(`[DeviceManager] Camera test pattern running on ${this.camera.device}`);
    }

    this.started = true;

    return {
      platform: this.platform,
      prerequisites: prereqs,
      cameraDevice: this.camera.device,
      audioSinkName: this.config.devices.sink.sinkName,
      audioMicName: this.config.devices.mic.sinkName,
      testPatternRunning: this.camera.isRunning,
    };
  }

  /** Stop camera feed and unload audio modules. Safe to call multiple times. */
  shutdown(): void {
    this.camera.stop();
    this.audio.cleanup();
    this.started = false;
    console.log('[DeviceManager] Devices cleaned up.');
  }

  /** Register SIGINT/SIGTERM handlers so cleanup runs on Ctrl+C or process kill. */
  registerShutdownHandlers(): void {
    const handler = () => {
      console.log('\n[DeviceManager] Received shutdown signal, cleaning up...');
      this.shutdown();
      process.exit(0);
    };
    process.on('SIGINT', handler);
    process.on('SIGTERM', handler);
  }
}
