#!/bin/bash
# BlackArch MCP - Linode StackScript (First-Boot Bootstrap)
# Runs on first boot to install Docker, Python, and prepare for MCP gateway.
# Does NOT modify any existing system configs outside /opt/blackarch-mcp.

set -e

export DEBIAN_FRONTEND=noninteractive

echo "[blackarch-mcp] Starting first-boot bootstrap..."

# Update and install base packages
apt-get update -qq
apt-get install -y -qq \
    docker.io \
    python3-full \
    python3-pip \
    python3-venv \
    curl \
    git

# Enable and start Docker
systemctl enable docker
systemctl start docker

# Install uv (Python package manager)
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"

# Create app directory
mkdir -p /opt/blackarch-mcp
cd /opt/blackarch-mcp

# Pull BlackArch base image (for tool execution)
docker pull blackarchlinux/blackarch:latest || true

echo "[blackarch-mcp] Bootstrap complete. Deploy main.py and run MCP gateway."
