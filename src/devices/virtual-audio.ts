import { execSync } from 'child_process';

export class VirtualAudioDevices {
  private sinkModuleId: number | null = null;
  private micModuleId: number | null = null;

  /**
   * Load two pactl modules:
   * 1. A null-sink for AI audio output (the AI writes to this; Chrome can subscribe to it)
   * 2. A virtual microphone source (Chrome sees this as a mic input device)
   *
   * IMPORTANT: module-null-sink with media.class=Audio/Source/Virtual creates a proper
   * source (not a monitor), so Chrome does NOT filter it from the microphone list.
   */
  create(
    sinkName: string,
    sinkLabel: string,
    micName: string,
    micLabel: string
  ): void {
    if (this.sinkModuleId !== null || this.micModuleId !== null) {
      throw new Error('VirtualAudioDevices: already created. Call cleanup() first.');
    }

    // Create output sink (AI audio goes here)
    const sinkOut = execSync(
      `pactl load-module module-null-sink sink_name="${sinkName}" sink_properties=device.description="${sinkLabel}"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    this.sinkModuleId = parseInt(sinkOut, 10);
    if (isNaN(this.sinkModuleId)) {
      throw new Error(`pactl returned unexpected output for sink: "${sinkOut}"`);
    }

    // Create virtual microphone (Chrome sees this as a mic input)
    // media.class=Audio/Source/Virtual prevents Chrome from filtering it as a monitor
    const micOut = execSync(
      `pactl load-module module-null-sink media.class=Audio/Source/Virtual sink_name="${micName}" sink_properties=device.description="${micLabel}"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    this.micModuleId = parseInt(micOut, 10);
    if (isNaN(this.micModuleId)) {
      throw new Error(`pactl returned unexpected output for mic: "${micOut}"`);
    }

    console.log(`[VirtualAudio] Loaded sink module ${this.sinkModuleId} (${sinkLabel})`);
    console.log(`[VirtualAudio] Loaded mic module ${this.micModuleId} (${micLabel})`);
  }

  /** Unload both pactl modules. Safe to call even if create() was never called. */
  cleanup(): void {
    if (this.micModuleId !== null) {
      try {
        execSync(`pactl unload-module ${this.micModuleId}`, { stdio: 'pipe' });
        console.log(`[VirtualAudio] Unloaded mic module ${this.micModuleId}`);
      } catch (err) {
        console.warn(`[VirtualAudio] Failed to unload mic module ${this.micModuleId}: ${(err as Error).message}`);
      }
      this.micModuleId = null;
    }
    if (this.sinkModuleId !== null) {
      try {
        execSync(`pactl unload-module ${this.sinkModuleId}`, { stdio: 'pipe' });
        console.log(`[VirtualAudio] Unloaded sink module ${this.sinkModuleId}`);
      } catch (err) {
        console.warn(`[VirtualAudio] Failed to unload sink module ${this.sinkModuleId}: ${(err as Error).message}`);
      }
      this.sinkModuleId = null;
    }
  }

  get sinkModule(): number | null { return this.sinkModuleId; }
  get micModule(): number | null { return this.micModuleId; }
}
