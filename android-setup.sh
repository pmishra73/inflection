#!/bin/bash
# =============================================================================
# Inflection — Android Build Setup
# Wraps the Next.js frontend as an Android APK using Capacitor
# Prerequisites: Node.js 18+, Android Studio with SDK, Java 17+
# =============================================================================

set -e

FRONTEND_DIR="$(cd "$(dirname "$0")/frontend" && pwd)"
cd "$FRONTEND_DIR"

echo "=========================================="
echo "  Inflection — Android Setup"
echo "=========================================="

# ── Step 1: Install Capacitor packages ────────────────────────────────────────
echo ""
echo "▶ Installing Capacitor packages..."
npm install \
  @capacitor/core \
  @capacitor/cli \
  @capacitor/android

# ── Step 2: Static export build ───────────────────────────────────────────────
echo ""
echo "▶ Building static Next.js export..."

# Set API URL to your production backend (edit this before building for release)
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-https://your-backend.railway.app}"
export NEXT_PUBLIC_WS_URL="${NEXT_PUBLIC_WS_URL:-wss://your-backend.railway.app}"
export BUILD_TARGET=android

npm run build

echo "   ✔ Static files in ./out/"

# ── Step 3: Init Capacitor (skip if already done) ─────────────────────────────
if [ ! -f "capacitor.config.ts" ]; then
  echo ""
  echo "▶ Initialising Capacitor..."
  npx cap init Inflection com.inflection.app --web-dir=out
fi

# ── Step 4: Add Android platform ──────────────────────────────────────────────
if [ ! -d "android" ]; then
  echo ""
  echo "▶ Adding Android platform..."
  npx cap add android
else
  echo ""
  echo "▶ Android platform already exists — skipping add."
fi

# ── Step 5: Sync web assets into Android project ─────────────────────────────
echo ""
echo "▶ Syncing web assets to Android..."
npx cap sync android

# ── Step 6: Patch AndroidManifest.xml for microphone + internet ──────────────
MANIFEST="android/app/src/main/AndroidManifest.xml"
if [ -f "$MANIFEST" ]; then
  echo ""
  echo "▶ Checking AndroidManifest.xml permissions..."

  # Add RECORD_AUDIO if missing
  if ! grep -q "RECORD_AUDIO" "$MANIFEST"; then
    sed -i '' 's|<uses-permission android:name="android.permission.INTERNET"|<uses-permission android:name="android.permission.RECORD_AUDIO" />\n    <uses-permission android:name="android.permission.INTERNET"|' "$MANIFEST"
    echo "   ✔ Added RECORD_AUDIO permission"
  else
    echo "   ✔ RECORD_AUDIO already present"
  fi

  # Add MODIFY_AUDIO_SETTINGS if missing
  if ! grep -q "MODIFY_AUDIO_SETTINGS" "$MANIFEST"; then
    sed -i '' 's|<uses-permission android:name="android.permission.INTERNET"|<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />\n    <uses-permission android:name="android.permission.INTERNET"|' "$MANIFEST"
    echo "   ✔ Added MODIFY_AUDIO_SETTINGS permission"
  fi
else
  echo "   ⚠ AndroidManifest.xml not found — permissions must be added manually"
fi

# ── Step 7: Open in Android Studio ────────────────────────────────────────────
echo ""
echo "=========================================="
echo "  Setup complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Update NEXT_PUBLIC_API_URL in .env.local to your production backend"
echo "  2. Run:  npx cap open android"
echo "     → Android Studio will open the project"
echo "  3. In Android Studio:"
echo "     - Connect a device or start an emulator"
echo "     - Click ▶ Run to install the APK"
echo "     - For a release APK: Build → Generate Signed Bundle/APK"
echo ""
echo "For local dev testing (backend on same machine):"
echo "  - Use your machine's local IP (e.g. http://192.168.x.x:8000)"
echo "  - NOT localhost (Android cannot reach host machine via localhost)"
echo ""

read -p "Open Android Studio now? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  npx cap open android
fi
