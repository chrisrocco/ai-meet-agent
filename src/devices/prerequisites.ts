import { execSync } from 'child_process';

export interface PrereqCheck {
  name: string;
  ok: boolean;
  fix?: string;
}

export interface PrereqResult {
  ok: boolean;
  checks: PrereqCheck[];
}

export function checkPrerequisites(videoNr: number = 10): PrereqResult {
  const checks: PrereqCheck[] = [];

  // 1. v4l2loopback kernel module loaded
  try {
    execSync('lsmod | grep -q v4l2loopback', { stdio: 'pipe' });
    checks.push({ name: 'v4l2loopback kernel module', ok: true });
  } catch {
    checks.push({
      name: 'v4l2loopback kernel module',
      ok: false,
      fix: `sudo modprobe v4l2loopback video_nr=${videoNr} card_label="AI Meet Agent Camera" exclusive_caps=1 max_buffers=2`,
    });
  }

  // 2. /dev/videoN character device exists
  const devicePath = `/dev/video${videoNr}`;
  try {
    execSync(`test -c ${devicePath}`, { stdio: 'pipe' });
    checks.push({ name: `${devicePath} exists`, ok: true });
  } catch {
    checks.push({
      name: `${devicePath} exists`,
      ok: false,
      fix: `sudo modprobe v4l2loopback video_nr=${videoNr} card_label="AI Meet Agent Camera" exclusive_caps=1 max_buffers=2`,
    });
  }

  // 3. PipeWire/PulseAudio responsive
  try {
    execSync('pactl info', { stdio: 'pipe' });
    checks.push({ name: 'PipeWire/PulseAudio (pactl)', ok: true });
  } catch {
    checks.push({
      name: 'PipeWire/PulseAudio (pactl)',
      ok: false,
      fix: 'systemctl --user start pipewire pipewire-pulse',
    });
  }

  // 4. ffmpeg binary available
  try {
    execSync('which ffmpeg', { stdio: 'pipe' });
    checks.push({ name: 'ffmpeg binary', ok: true });
  } catch {
    checks.push({
      name: 'ffmpeg binary',
      ok: false,
      fix: 'sudo apt-get install -y ffmpeg',
    });
  }

  return {
    ok: checks.every((c) => c.ok),
    checks,
  };
}

export function printPrereqStatus(result: PrereqResult): void {
  for (const check of result.checks) {
    const icon = check.ok ? '[OK]' : '[FAIL]';
    console.log(`  ${icon} ${check.name}`);
    if (!check.ok && check.fix) {
      console.log(`       Fix: ${check.fix}`);
    }
  }
  if (!result.ok) {
    console.error('\nPrerequisite checks failed. Run the fix commands above, then try again.');
  }
}
