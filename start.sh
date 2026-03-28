#!/bin/bash

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     Inflection — Starting App        ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Trap to kill all children on Ctrl+C
trap 'echo ""; echo "Shutting down..."; kill 0' EXIT

# ── Backend ──────────────────────────────────────────────────────────────
echo "▶ Starting FastAPI backend on http://localhost:8000 ..."
cd backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
deactivate
cd ..

# Wait for backend to be ready
echo "  Waiting for backend..."
for i in {1..20}; do
  if curl -s http://localhost:8000/health >/dev/null 2>&1; then
    echo "  ✓ Backend ready"
    break
  fi
  sleep 1
done

# ── Frontend ──────────────────────────────────────────────────────────────
echo ""
echo "▶ Starting Next.js frontend on http://localhost:3000 ..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  App running!                            ║"
echo "║  Frontend: http://localhost:3000         ║"
echo "║  Backend:  http://localhost:8000         ║"
echo "║  API Docs: http://localhost:8000/docs    ║"
echo "║                                          ║"
echo "║  Press Ctrl+C to stop                    ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
