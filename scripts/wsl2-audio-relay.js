#!/usr/bin/env node
/**
 * WSL2 Audio Relay Server
 *
 * Runs on Windows (launched from WSL2 via node.exe or powershell.exe).
 * Bridges audio between WSL2 Node.js (TCP client) and Windows audio devices.
 *
 * Protocol:
 * - TCP server on configurable port (default: 19876)
 * - Length-prefixed framing: [4-byte LE uint32 length][payload]
 * - First frame is JSON handshake: { type: 'capture' | 'output', sink: string }
 * - Subsequent frames are raw PCM data (s16le, 16kHz, mono)
 *
 * Requirements (Windows side):
 * - Node.js installed and accessible as node.exe
 * - For capture: parec available (PulseAudio for Windows or similar)
 * - For output: pacat available
 * - VB-Cable installed for virtual audio routing
 *
 * Usage:
 *   node wsl2-audio-relay.js [--port PORT]
 *
 * From WSL2:
 *   powershell.exe -Command "node $(wslpath -w scripts/wsl2-audio-relay.js)"
 *   # or
 *   node.exe scripts/wsl2-audio-relay.js
 */

const net = require('net');
const { spawn } = require('child_process');

const PORT = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--port') || '19876', 10);

/**
 * Read a length-prefixed frame from accumulated buffer.
 * Returns { frame: Buffer, remaining: Buffer } or null if incomplete.
 */
function readFrame(buffer) {
  if (buffer.length < 4) return null;
  const len = buffer.readUInt32LE(0);
  if (buffer.length < 4 + len) return null;
  return {
    frame: buffer.subarray(4, 4 + len),
    remaining: buffer.subarray(4 + len),
  };
}

/** Write a length-prefixed frame to a socket. */
function writeFrame(socket, payload) {
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length);
  socket.write(header);
  socket.write(payload);
}

const server = net.createServer((socket) => {
  const addr = `${socket.remoteAddress}:${socket.remotePort}`;
  console.error(`[relay] Connection from ${addr}`);

  let buffer = Buffer.alloc(0);
  let handshakeDone = false;
  let audioProc = null;

  socket.on('data', (data) => {
    buffer = Buffer.concat([buffer, data]);

    if (!handshakeDone) {
      const result = readFrame(buffer);
      if (!result) return; // Wait for complete handshake frame

      buffer = result.remaining;
      handshakeDone = true;

      let handshake;
      try {
        handshake = JSON.parse(result.frame.toString());
      } catch (e) {
        console.error(`[relay] Invalid handshake from ${addr}:`, e.message);
        socket.destroy();
        return;
      }

      console.error(`[relay] Handshake: type=${handshake.type}, sink=${handshake.sink}`);

      if (handshake.type === 'capture') {
        // Spawn parec to capture audio and send frames to client
        const device = `${handshake.sink}.monitor`;
        console.error(`[relay] Starting capture from ${device}`);

        audioProc = spawn('parec', [
          '--device', device,
          '--format', 's16le',
          '--rate', '16000',
          '--channels', '1',
          '--latency-msec', '20',
        ]);

        audioProc.stdout.on('data', (chunk) => {
          if (!socket.destroyed) {
            writeFrame(socket, chunk);
          }
        });

        audioProc.stderr.on('data', (data) => {
          console.error(`[relay:parec] ${data.toString().trim()}`);
        });

        audioProc.on('exit', (code) => {
          console.error(`[relay] parec exited with code ${code}`);
          if (!socket.destroyed) socket.destroy();
        });

      } else if (handshake.type === 'output') {
        // Spawn pacat to play audio from client
        console.error(`[relay] Starting output to ${handshake.sink}`);

        audioProc = spawn('pacat', [
          '--device', handshake.sink,
          '--format', 's16le',
          '--rate', '16000',
          '--channels', '1',
          '--latency-msec', '20',
        ]);

        audioProc.stderr.on('data', (data) => {
          console.error(`[relay:pacat] ${data.toString().trim()}`);
        });

        audioProc.on('exit', (code) => {
          console.error(`[relay] pacat exited with code ${code}`);
          if (!socket.destroyed) socket.destroy();
        });

        // Process any buffered data after handshake
        processOutputBuffer();
      } else {
        console.error(`[relay] Unknown type: ${handshake.type}`);
        socket.destroy();
      }

      return;
    }

    // After handshake: process incoming frames for output connections
    if (audioProc && audioProc.stdin) {
      processOutputBuffer();
    }
  });

  function processOutputBuffer() {
    let result;
    while ((result = readFrame(buffer)) !== null) {
      buffer = result.remaining;
      if (audioProc && audioProc.stdin && !audioProc.stdin.destroyed) {
        audioProc.stdin.write(result.frame);
      }
    }
  }

  socket.on('close', () => {
    console.error(`[relay] Disconnected: ${addr}`);
    if (audioProc) {
      audioProc.kill('SIGTERM');
      audioProc = null;
    }
  });

  socket.on('error', (err) => {
    console.error(`[relay] Socket error from ${addr}: ${err.message}`);
    if (audioProc) {
      audioProc.kill('SIGTERM');
      audioProc = null;
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.error(`[relay] Audio relay server listening on port ${PORT}`);
  console.error('[relay] Waiting for connections from WSL2...');
});

server.on('error', (err) => {
  console.error(`[relay] Server error: ${err.message}`);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.error('[relay] Shutting down...');
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('[relay] Shutting down...');
  server.close();
  process.exit(0);
});
