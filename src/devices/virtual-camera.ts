import { spawn, type ChildProcess } from 'child_process';

export class VirtualCamera {
  private ffmpegProcess: ChildProcess | null = null;
  private readonly devicePath: string;

  constructor(videoNr: number) {
    this.devicePath = `/dev/video${videoNr}`;
  }

  /** Start feeding a test pattern (color bars) at 30fps. Runs until stop() is called. */
  startTestPattern(): void {
    if (this.ffmpegProcess) {
      throw new Error('VirtualCamera: test pattern already running. Call stop() first.');
    }
    this.ffmpegProcess = spawn(
      'ffmpeg',
      [
        '-f', 'lavfi',
        '-i', 'testsrc=size=1280x720:rate=30',
        '-f', 'v4l2',
        '-pix_fmt', 'yuv420p',
        this.devicePath,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    this.ffmpegProcess.on('error', (err) => {
      console.error(`[VirtualCamera] ffmpeg process error: ${err.message}`);
    });

    this.ffmpegProcess.on('exit', (code, signal) => {
      if (signal !== 'SIGTERM') {
        // Unexpected exit — log but don't throw (cleanup may call stop() afterward)
        console.warn(`[VirtualCamera] ffmpeg exited unexpectedly (code=${code}, signal=${signal})`);
      }
      this.ffmpegProcess = null;
    });
  }

  /** Stop the ffmpeg process with SIGTERM. Safe to call when not running. */
  stop(): void {
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill('SIGTERM');
      this.ffmpegProcess = null;
    }
  }

  get isRunning(): boolean {
    return this.ffmpegProcess !== null;
  }

  get device(): string {
    return this.devicePath;
  }
}
