#!/bin/bash
echo "=== DEPLOYMENT VERIFICATION ==="
echo ""
echo "1. Checking container status..."
docker compose ps webapp | grep webapp
echo ""
echo "2. Checking if new code exists in container..."
docker compose exec webapp grep -r "NEW UI ACTIVE" /app/.next/ 2>/dev/null && echo "✅ New code found" || echo "❌ Old code (marker not found)"
echo ""
echo "3. Checking latest JS file timestamp..."
docker compose exec webapp ls -lt /app/.next/static/chunks/*.js 2>/dev/null | head -1
echo ""
echo "4. Checking container start time..."
docker compose ps webapp --format "table {{.Name}}\t{{.Status}}\t{{.CreatedAt}}"
echo ""
echo "=== NEXT STEPS ==="
echo "If marker not found: Run 'docker compose build --no-cache webapp && docker compose up -d webapp'"
echo "If marker found: Clear browser cache (DevTools → Disable cache → Hard refresh)"
