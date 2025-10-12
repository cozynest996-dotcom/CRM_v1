#!/usr/bin/env bash
# start_servers.sh
# Starts backend (uvicorn), whatsapp_gateway (node) and frontend (next) in background.

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs"
mkdir -p "$LOG_DIR"

BACKEND_PORT=${BACKEND_PORT:-8000}
GATEWAY_PORT=${GATEWAY_PORT:-3002}
FRONTEND_PORT=${FRONTEND_PORT:-3000}

echo "Starting services from $ROOT_DIR"

# Backend
echo "[BACKEND] Starting on port $BACKEND_PORT..."
cd "$ROOT_DIR/backend"
if [ -f ".venv/bin/activate" ]; then
  source .venv/bin/activate
else
  echo "[WARN] backend/.venv not found. Create it with: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
fi
nohup python -m uvicorn app.main:app --host 0.0.0.0 --port "$BACKEND_PORT" --reload > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

sleep 1

# WhatsApp gateway
echo "[GATEWAY] Starting gateway (node)..."
cd "$ROOT_DIR/whatsapp_gateway"
nohup node index.js > "$LOG_DIR/gateway.log" 2>&1 &
GATEWAY_PID=$!
echo "Gateway PID: $GATEWAY_PID"

sleep 1

# Frontend
echo "[FRONTEND] Starting frontend (Next.js)..."
cd "$ROOT_DIR/frontend"
nohup npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"

echo "Services started. Logs are in $LOG_DIR"
echo "Backend: http://localhost:$BACKEND_PORT"
echo "Frontend: http://localhost:$FRONTEND_PORT"

if which open >/dev/null 2>&1; then
  open "http://localhost:$FRONTEND_PORT"
fi

echo "To stop the servers run: kill $BACKEND_PID $GATEWAY_PID $FRONTEND_PID  || ./stop_servers.sh"



