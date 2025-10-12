#!/usr/bin/env bash
# install_deps.sh
# Installs system and project dependencies for macOS (Homebrew, Python, Node, project libs)

set -e

echo "== macOS dependency installer =="

# Homebrew
if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew not found. Installing..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
else
  echo "Homebrew found"
fi

brew update || true

echo "Installing Python3 and Node.js via Homebrew..."
brew install python node || true

echo "Ensure pip and npm are up to date"
python3 -m pip install --upgrade pip setuptools wheel
npm install -g npm

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo "Project root: $ROOT_DIR"

echo "Installing backend Python deps..."
cd "$ROOT_DIR/backend"
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install -r requirements.txt
deactivate

echo "Installing frontend deps..."
cd "$ROOT_DIR/frontend"
npm install

echo "Installing whatsapp gateway deps..."
cd "$ROOT_DIR/whatsapp_gateway"
npm install

echo "Installing telegram gateway deps..."
cd "$ROOT_DIR/telegram_gateway"
if [ -f "requirements.txt" ]; then
  if [ ! -d "./.venv" ]; then
    python3 -m venv .venv
  fi
  source .venv/bin/activate
  pip install -r requirements.txt
  deactivate
fi

echo "All dependencies installed."



