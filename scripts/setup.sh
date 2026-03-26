#!/usr/bin/env bash
# AI Meet Agent — One-time system setup
# Run once to install dependencies and persist v4l2loopback across reboots.
# Does NOT need to be run again unless you reinstall the OS or upgrade the kernel.
#
# Usage: bash scripts/setup.sh
# Requires: sudo (for apt-get and modprobe.d config)

set -euo pipefail

echo "=== AI Meet Agent: System Setup ==="
echo ""

# 1. Install required packages
echo "--- Installing system packages ---"
sudo apt-get update -qq
sudo apt-get install -y \
  v4l2loopback-dkms \
  v4l2loopback-utils \
  ffmpeg \
  pipewire \
  pipewire-pulse \
  wireplumber \
  pulseaudio-utils

echo ""
echo "--- Configuring v4l2loopback to persist across reboots ---"

# 2. Create modprobe options file (sets card_label and exclusive_caps=1)
sudo tee /etc/modprobe.d/ai-meet-agent.conf > /dev/null << 'EOF'
# AI Meet Agent virtual camera options
# exclusive_caps=1 is REQUIRED for Chrome/WebRTC to see the device
options v4l2loopback video_nr=10 card_label="AI Meet Agent Camera" exclusive_caps=1 max_buffers=2
EOF
echo "  [OK] /etc/modprobe.d/ai-meet-agent.conf written"

# 3. Enable v4l2loopback to load at boot
if grep -qxF "v4l2loopback" /etc/modules-load.d/ai-meet-agent.conf 2>/dev/null; then
  echo "  [OK] v4l2loopback already in modules-load.d"
else
  echo "v4l2loopback" | sudo tee /etc/modules-load.d/ai-meet-agent.conf > /dev/null
  echo "  [OK] /etc/modules-load.d/ai-meet-agent.conf written"
fi

# 4. Load the module right now (without requiring a reboot)
echo ""
echo "--- Loading v4l2loopback module ---"
if lsmod | grep -q v4l2loopback; then
  echo "  [OK] v4l2loopback already loaded"
else
  sudo modprobe v4l2loopback
  echo "  [OK] v4l2loopback loaded"
fi

# 5. Verify /dev/video10 was created
if test -c /dev/video10; then
  echo "  [OK] /dev/video10 exists"
else
  echo "  [FAIL] /dev/video10 not created. Check: sudo modprobe v4l2loopback video_nr=10 card_label='AI Meet Agent Camera' exclusive_caps=1 max_buffers=2"
  exit 1
fi

echo ""
echo "=== Setup complete ==="
echo ""
echo "Manual steps summary (what this script did):"
echo "  1. apt-get install v4l2loopback-dkms v4l2loopback-utils ffmpeg pipewire pipewire-pulse wireplumber pulseaudio-utils"
echo "  2. Created /etc/modprobe.d/ai-meet-agent.conf with exclusive_caps=1 options"
echo "  3. Created /etc/modules-load.d/ai-meet-agent.conf to load v4l2loopback on boot"
echo "  4. Loaded v4l2loopback module for this session"
echo ""
echo "Next step: npm run test-devices"
