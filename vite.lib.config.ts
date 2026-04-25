import { defineConfig } from "vite";
import { resolve } from "node:path";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [dts({ insertTypesEntry: true, outDir: "dist-lib" })],
  build: {
    outDir: "dist-lib",
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "SplatViewer",
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: ["three", "three/examples/jsm/controls/OrbitControls.js"],
    },
  },
});