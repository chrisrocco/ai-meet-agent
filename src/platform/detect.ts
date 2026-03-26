import { readFileSync } from 'fs';

export type Platform = 'native-linux' | 'wsl2';

export function detectPlatform(procVersionPath = '/proc/version'): Platform {
  try {
    const version = readFileSync(procVersionPath, 'utf8').toLowerCase();
    if (version.includes('microsoft') || version.includes('wsl')) {
      return 'wsl2';
    }
  } catch {
    // /proc/version not readable — assume native Linux
  }
  return 'native-linux';
}
