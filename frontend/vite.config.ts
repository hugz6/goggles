import { defineConfig } from "vite";

// Builds into the Go module's tree so the backend can embed it (go:embed
// requires the embedded path to live under the importing package's directory).
// See backend/internal/webui.
export default defineConfig({
  build: {
    outDir: "../backend/internal/webui/dist",
    emptyOutDir: true,
  },
});
