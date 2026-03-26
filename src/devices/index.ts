import { type Config } from '../config/schema.js';
import { checkPrerequisites, printPrereqStatus, type PrereqResult } from './prerequisites.js';
import { VirtualCamera } from './virtual-camera.js';
import { VirtualAudioDevices } from './virtual-audio.js';

export interface DeviceStatus {
  prerequisites: PrereqResult;
  cameraDevice: string;
  audioSinkName: string;
  audioMicName: string;
  testPatternRunning: boolean;
}

export class DeviceManager {
  private camera: VirtualCamera;
  private audio: VirtualAudioDevices;
  private config: Config;
  private started = false;

  constructor(config: Config) {
    this.config = config;
    this.camera = new VirtualCamera(config.devices.camera.videoNr);
    this.audio = new VirtualAudioDevices();
  }

  /**
   * Check prerequisites, create virtual audio devices, and start camera test pattern.
   * Throws if prerequisites fail — caller must handle and display fix instructions.
   */
  startup(options: { startTestPattern?: boolean } = {}): DeviceStatus {
    if (this.started) {
      throw new Error('DeviceManager: already started');
    }

    // 1. Check prerequisites
    const prereqs = checkPrerequisites(this.config.devices.camera.videoNr);
    console.log('\nPrerequisite checks:');
    printPrereqStatus(prereqs);

    if (!prereqs.ok) {
      throw new Error('Prerequisites not met. Fix the issues above and try again.');
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
