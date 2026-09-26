import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

function projectFile(name: string): string {
  return fileURLToPath(new URL(name, import.meta.url));
}

// Landing page entry at / and the game entry at /play.
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
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
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
  const raw = req.url || "";
  const queryIndex = raw.indexOf("?");
  const path = queryIndex === -1 ? raw : raw.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : raw.slice(queryIndex);
  const onPlay = path === "/play" || path.indexOf("/play/") === 0;
  const leaf = path.slice(path.lastIndexOf("/") + 1);
  const isFile = leaf.indexOf(".") !== -1;
  if (onPlay && !isFile) {
    req.url = "/play/index.html" + query;
  }
  next();
}
