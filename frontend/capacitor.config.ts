import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.inflection.app",
  appName: "Inflection",
  webDir: "out",
  server: {
    // For development: point to your local backend
    // In production builds, remove this and use bundled files
    androidScheme: "https",
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    Microphone: {
      // Microphone access is declared in AndroidManifest.xml
    },
  },
};

export default config;
