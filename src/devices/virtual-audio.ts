import { execSync } from 'child_process';

export class VirtualAudioDevices {
  private sinkModuleId: number | null = null;
  private micSinkModuleId: number | null = null;
  private micSourceModuleId: number | null = null;

  /**
   * Load three pactl modules:
   * 1. A null-sink for capturing Meet audio (parec reads its monitor)
   * 2. A null-sink for the virtual mic (pacat writes AI audio here)
   * 3. A remap-source exposing the mic sink's monitor as a proper source
   *    that Chrome sees as a selectable microphone input
   *
   * The remap-source is needed because PipeWire's module-null-sink with
   * media.class=Audio/Source/Virtual creates a disconnected source —
   * audio written to the sink never reaches the source. The remap-source
   * bridges the sink's monitor to a real source Chrome can read.
   */
  create(
    sinkName: string,
    sinkLabel: string,
    micName: string,
    micLabel: string
  ): void {
    if (this.sinkModuleId !== null || this.micSinkModuleId !== null) {
      throw new Error('VirtualAudioDevices: already created. Call cleanup() first.');
    }

    // Save current default sink so we can restore it after creating null-sinks
    // (PipeWire may switch the default to a newly created null-sink)
    let previousDefaultSink: string | null = null;
    try {
      previousDefaultSink = execSync('pactl get-default-sink', {
        encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch { /* ignore — will skip restore */ }

    // 1. Create capture sink (Meet audio goes here, parec reads its monitor)
    const sinkOut = execSync(
      `pactl load-module module-null-sink sink_name="${sinkName}" sink_properties=device.description="${sinkLabel}"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    this.sinkModuleId = parseInt(sinkOut, 10);
    if (isNaN(this.sinkModuleId)) {
      throw new Error(`pactl returned unexpected output for sink: "${sinkOut}"`);
    }

    // 2. Create mic null-sink (pacat writes AI audio here)
    const micSinkOut = execSync(
      `pactl load-module module-null-sink sink_name="${micName}" sink_properties=device.description="${micLabel}"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    this.micSinkModuleId = parseInt(micSinkOut, 10);
    if (isNaN(this.micSinkModuleId)) {
      throw new Error(`pactl returned unexpected output for mic sink: "${micSinkOut}"`);
    }

    // 3. Remap the mic sink's monitor as a proper source (Chrome sees this as a mic)
    const micSourceOut = execSync(
      `pactl load-module module-remap-source source_name="${micName}_source" master="${micName}.monitor" source_properties=device.description="${micLabel}"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    this.micSourceModuleId = parseInt(micSourceOut, 10);
    if (isNaN(this.micSourceModuleId)) {
      throw new Error(`pactl returned unexpected output for mic source: "${micSourceOut}"`);
    }

    // Restore default sink so operator audio (ffplay) goes to speakers, not a null-sink
    if (previousDefaultSink) {
      try {
        execSync(`pactl set-default-sink "${previousDefaultSink}"`, { stdio: 'pipe' });
      } catch { /* ignore — non-fatal */ }
    }

    console.log(`[VirtualAudio] Loaded sink module ${this.sinkModuleId} (${sinkLabel})`);
    console.log(`[VirtualAudio] Loaded mic module ${this.micSinkModuleId} + remap ${this.micSourceModuleId} (${micLabel})`);
  }

  /** Unload all pactl modules. Safe to call even if create() was never called. */
  cleanup(): void {
    // Unload in reverse order: remap source first, then sinks
    if (this.micSourceModuleId !== null) {
      try {
        execSync(`pactl unload-module ${this.micSourceModuleId}`, { stdio: 'pipe' });
      } catch (err) {
        console.warn(`[VirtualAudio] Failed to unload mic remap module ${this.micSourceModuleId}: ${(err as Error).message}`);
      }
      this.micSourceModuleId = null;
    }
    if (this.micSinkModuleId !== null) {
      try {
        execSync(`pactl unload-module ${this.micSinkModuleId}`, { stdio: 'pipe' });
      } catch (err) {
        console.warn(`[VirtualAudio] Failed to unload mic sink module ${this.micSinkModuleId}: ${(err as Error).message}`);
      }
      this.micSinkModuleId = null;
    }
    if (this.sinkModuleId !== null) {
      try {
        execSync(`pactl unload-module ${this.sinkModuleId}`, { stdio: 'pipe' });
      } catch (err) {
        console.warn(`[VirtualAudio] Failed to unload sink module ${this.sinkModuleId}: ${(err as Error).message}`);
      }
      this.sinkModuleId = null;
    }
    console.log('[VirtualAudio] Modules unloaded.');
  }

  get sinkModule(): number | null { return this.sinkModuleId; }
  get micSinkModule(): number | null { return this.micSinkModuleId; }
  get micSourceModule(): number | null { return this.micSourceModuleId; }
}
