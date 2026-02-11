#!/bin/bash

# PandaExploit Launch Script
# This script helps you launch PandaExploit step by step

set -e

echo "=========================================="
echo "PandaExploit Launch Script"
echo "=========================================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Creating from .env.example..."
    cp .env.example .env
    echo "✅ .env file created"
    echo ""
    echo "⚠️  IMPORTANT: Please edit .env and add at least one AI API key:"
    echo "   - ANTHROPIC_API_KEY=sk-ant-..."
    echo "   - or OPENAI_API_KEY=sk-proj-..."
    echo ""
    read -p "Press Enter after you've added your API key to .env..."
fi

# Check if API key is set
if ! grep -qE "ANTHROPIC_API_KEY=sk-" .env && ! grep -qE "OPENAI_API_KEY=sk-" .env; then
    echo "⚠️  WARNING: No API key detected in .env"
    echo "   The services will start but the AI agent won't work without an API key."
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Exiting. Please add an API key to .env and run again."
        exit 1
    fi
fi

# Check Docker
if ! docker ps > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop and try again."
    exit 1
fi
echo "✅ Docker is running"

# Build images
echo ""
echo "📦 Building Docker images (this may take 10-30 minutes on first run)..."
docker compose --profile tools build

# Start services
echo ""
echo "🚀 Starting all services..."
docker compose up -d

# Wait a bit for services to start
echo ""
echo "⏳ Waiting for services to initialize..."
sleep 10

# Check status
echo ""
echo "📊 Service Status:"
docker compose ps

echo ""
echo "=========================================="
echo "✅ PandaExploit is starting up!"
echo "=========================================="
echo ""
echo "🌐 Webapp: http://localhost:3000"
echo "📊 Neo4j Browser: http://localhost:7474"
echo ""
echo "To view logs: docker compose logs -f"
echo "To stop: docker compose down"
echo ""
