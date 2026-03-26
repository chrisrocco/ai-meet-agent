import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';

/**
 * Video feed interface — streams a static image to the virtual camera.
 *
 * Events:
 * - 'restarting': ffmpeg exited unexpectedly, restarting
 * - 'error': Fatal error (Error payload)
 */
export interface VideoFeed extends EventEmitter {
  start(imagePath: string): void;
  stop(): void;
}

export const DEFAULT_PLACEHOLDER_PATH = fileURLToPath(
  new URL('./assets/placeholder.jpg', import.meta.url)
);
