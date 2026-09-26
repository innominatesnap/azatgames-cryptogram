import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

function projectFile(name: string): string {
  return fileURLToPath(new URL(name, import.meta.url));
}

// Landing at `/` and the game entry at `/play`. PR-CGM-1 replaces play/index.html.
export default defineConfig({
  plugins: [
    react(),
    {
      name: "play-index",
      configureServer(server) {
        server.middlewares.use(rewritePlayIndex);
      },
      configurePreviewServer(server) {
        server.middlewares.use(rewritePlayIndex);
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        main: projectFile("./index.html"),
        play: projectFile("./play/index.html"),
      },
    },
  },
  test: {
    environment: "node",
  },
});

function rewritePlayIndex(
  req: { url?: string },
  _res: unknown,
  next: () => void,
): void {
  const path = req.url?.split("?")[0];
  if (path === "/play" || path === "/play/") {
    const query = req.url?.includes("?") ? `?${req.url.split("?")[1]}` : "";
    req.url = `/play/index.html${query}`;
  }
  next();
}
