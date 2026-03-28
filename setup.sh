#!/bin/bash
set -e

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     Inflection — Setup Script        ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── Backend ──────────────────────────────────────────────────────────────
echo "▶ Setting up Python backend..."

cd backend

if ! command -v python3 &>/dev/null; then
  echo "✗ Python 3 is required. Install from https://python.org"
  exit 1
fi

# Create virtual environment
if [ ! -d "venv" ]; then
  python3 -m venv venv
  echo "  ✓ Created Python virtual environment"
fi

source venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements.txt
echo "  ✓ Installed Python dependencies"

# Create .env if not exists
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "  ✓ Created backend/.env from template"
  echo "  ⚠  Edit backend/.env and add your API keys"
fi

deactivate
cd ..

# ── Frontend ──────────────────────────────────────────────────────────────
echo ""
echo "▶ Setting up Next.js frontend..."

cd frontend

if ! command -v node &>/dev/null; then
  echo "✗ Node.js is required. Install from https://nodejs.org"
  exit 1
fi

# Create .env.local if not exists
if [ ! -f ".env.local" ]; then
  cp .env.example .env.local
  echo "  ✓ Created frontend/.env.local from template"
fi

npm install --legacy-peer-deps --silent
echo "  ✓ Installed Node.js dependencies"

cd ..

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ✓ Setup complete!                                           ║"
echo "║                                                              ║"
echo "║  Next steps:                                                 ║"
echo "║  1. Add your API keys to backend/.env                        ║"
echo "║     • ANTHROPIC_API_KEY  → console.anthropic.com             ║"
echo "║     • DEEPGRAM_API_KEY   → console.deepgram.com              ║"
echo "║     • HUME_API_KEY       → platform.hume.ai                  ║"
echo "║     • ELEVENLABS_API_KEY → elevenlabs.io                     ║"
echo "║                                                              ║"
echo "║  2. Run: ./start.sh                                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
