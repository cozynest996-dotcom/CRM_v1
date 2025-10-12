#!/usr/bin/env bash
# stop_servers.sh
# Stops uvicorn, node gateway and next dev processes started by start_servers.sh (best-effort)

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo "Stopping services (best-effort)..."

# Try to read PIDs from logs (not guaranteed)
pkill -f "uvicorn app.main:app" || true
pkill -f "node index.js" || true
pkill -f "next dev" || true
pkill -f "npm run dev" || true

echo "Stop commands issued. Confirm with: ps aux | grep uvicorn | grep -v grep"



