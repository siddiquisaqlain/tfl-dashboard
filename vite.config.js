import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ["Android >= 6", "Chrome >= 49"],
      modernPolyfills: true,
      renderLegacyChunks: true,
    }),
  ],

  // Only needed while developing on your LAN (phone/frame testing)
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    hmr: {
      host: "192.168.0.180",
      clientPort: 5173,
    },
  },

  build: {
    target: "es2015",
  },
});