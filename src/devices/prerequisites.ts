import { execSync } from 'child_process';

export interface PrereqResult {
  ok: boolean;
  checks: PrereqCheck[];
  videoAvailable?: boolean;
}

export interface PrereqCheck {
  name: string;
  ok: boolean;
  fix?: string;
  optional?: boolean;
}

export function checkPrerequisites(videoNr: number = 10): PrereqResult {
  const checks: PrereqCheck[] = [];

  // 1. PipeWire/PulseAudio responsive (REQUIRED)
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

  // 2. ffmpeg binary available (REQUIRED)
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

  // 3. v4l2loopback kernel module (OPTIONAL — needed for virtual camera)
  try {
    execSync('lsmod | grep -q v4l2loopback', { stdio: 'pipe' });
    checks.push({ name: 'v4l2loopback kernel module (video)', ok: true, optional: true });
  } catch {
    checks.push({
      name: 'v4l2loopback kernel module (video)',
      ok: false,
      optional: true,
      fix: `sudo modprobe v4l2loopback video_nr=${videoNr} card_label="AIMeet Camera" exclusive_caps=1 max_buffers=2`,
    });
  }

  // 4. /dev/videoN character device exists (OPTIONAL — depends on v4l2loopback)
  const devicePath = `/dev/video${videoNr}`;
  try {
    execSync(`test -c ${devicePath}`, { stdio: 'pipe' });
    checks.push({ name: `${devicePath} exists (video)`, ok: true, optional: true });
  } catch {
    checks.push({
      name: `${devicePath} exists (video)`,
      ok: false,
      optional: true,
      fix: `sudo modprobe v4l2loopback video_nr=${videoNr} card_label="AIMeet Camera" exclusive_caps=1 max_buffers=2`,
    });
  }

  // Required checks must all pass; optional failures are warnings
  const requiredOk = checks.filter(c => !c.optional).every(c => c.ok);
  const videoAvailable = checks.filter(c => c.optional).every(c => c.ok);

  return {
    ok: requiredOk,
    checks,
    videoAvailable,
  };
}

export function printPrereqStatus(result: PrereqResult): void {
  for (const check of result.checks) {
    if (check.ok) {
      console.log(`  [OK] ${check.name}`);
    } else if (check.optional) {
      console.log(`  [SKIP] ${check.name} (optional)`);
      if (check.fix) console.log(`         To enable: ${check.fix}`);
    } else {
      console.log(`  [FAIL] ${check.name}`);
      if (check.fix) console.log(`         Fix: ${check.fix}`);
    }
  }
  if (!result.ok) {
    console.error('\nRequired prerequisites failed. Run the fix commands above, then try again.');
  }
}
