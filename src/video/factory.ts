import { detectPlatform, type Platform } from '../platform/detect.js';
import { NativeVideoFeed } from './native-feed.js';
import { Wsl2VideoFeed } from './wsl2-feed.js';
import type { VideoFeed } from './types.js';

/**
 * Create the appropriate VideoFeed for the current platform.
 *
 * @param videoNr  - v4l2 device number (used on native Linux only)
 * @param mjpegPort - HTTP port for MJPEG broadcast (used on WSL2 only)
 * @param platform  - Override platform detection (for testing)
 */
export function createVideoFeed(
  videoNr: number,
  mjpegPort?: number,
  platform?: Platform,
): VideoFeed {
  const p = platform ?? detectPlatform();
  if (p === 'wsl2') {
    return new Wsl2VideoFeed(mjpegPort);
  }
  return new NativeVideoFeed(videoNr);
}
