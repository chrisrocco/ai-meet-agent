import { execSync } from 'child_process';

export type Wsl2Path = 'wslg' | 'windows-bridge' | 'unknown';

export interface Wsl2Status {
  path: Wsl2Path;
  checks: { name: string; ok: boolean; note?: string }[];
}

/**
 * Probe the WSL2 environment to determine which device path is viable.
 * Does NOT create any devices — only checks what's available.
 *
 * Probe results (2026-03-26, WSL2 2.3.26.0 / WSLg 1.0.65 / kernel 5.15.167.4-microsoft-standard-WSL2):
 * - v4l2loopback: DKMS module not compiled for WSL2 kernel → camera requires Windows-side OBS Virtual Camera
 * - pactl: command not found → audio requires Windows-side VB-Cable
 * - Conclusion: PATH B (windows-bridge) is the only viable path on this system
 */
export function checkWsl2Prerequisites(): Wsl2Status {
  const checks: { name: string; ok: boolean; note?: string }[] = [];
  let path: Wsl2Path = 'unknown';

  // Can v4l2loopback module be loaded?
  try {
    execSync('lsmod | grep -q v4l2loopback', { stdio: 'pipe' });
    checks.push({
      name: 'v4l2loopback module loaded',
      ok: true,
      note: 'WSLg camera path may work',
    });
    path = 'wslg';
  } catch {
    checks.push({
      name: 'v4l2loopback module loaded',
      ok: false,
      note: 'DKMS module not available for WSL2 kernel — use Windows-side OBS Virtual Camera',
    });
    path = 'windows-bridge';
  }

  // Is pactl responsive?
  try {
    execSync('pactl info', { stdio: 'pipe' });
    checks.push({
      name: 'PulseAudio (pactl)',
      ok: true,
      note: 'Audio may work under WSLg (stability: uncertain)',
    });
  } catch {
    checks.push({
      name: 'PulseAudio (pactl)',
      ok: false,
      note: 'pactl not available — use VB-Cable on Windows side',
    });
    // If either camera or audio requires windows-bridge, the whole path is windows-bridge
    path = 'windows-bridge';
  }

  return { path, checks };
}
