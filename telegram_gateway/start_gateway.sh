#!/usr/bin/env bash
set -e
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo "Starting telegram gateway..."
cd "$ROOT_DIR/telegram_gateway"
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install -r requirements.txt
export BACKEND_WEBHOOK_URL=${BACKEND_WEBHOOK_URL:-http://localhost:8000/api/telegram/webhook}
python gateway.py


