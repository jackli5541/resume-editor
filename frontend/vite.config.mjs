import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export default defineConfig({
  root: projectRoot,
  publicDir: false,
  build: {
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL("./src/bootstrap.mjs", import.meta.url)),
      formats: ["es"],
      fileName: () => "bootstrap.mjs"
    },
    outDir: fileURLToPath(new URL("../public/assets/vue/", import.meta.url)),
    sourcemap: true
  }
});
