import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HUB_LOGIN_URL, signInHref } from "./hub";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readProject(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

describe("sign-in link", () => {
  it("builds the hub URL from the page origin", () => {
    const href = signInHref("https://cryptogram-preview.vercel.app");
    const url = new URL(href);
    expect(url.origin + url.pathname).toBe(HUB_LOGIN_URL);
    expect(url.searchParams.get("redirect_to")).toBe(
      "https://cryptogram-preview.vercel.app/play",
    );
  });

  it("matches the static production fallback in the landing page", () => {
    const html = readProject("index.html");
    expect(html).toContain(signInHref("https://cryptogram.azat.games"));
    expect(html).toContain("Coming soon · Sign in");
    expect(html).toContain("For players 13 and up.");
    expect(html).not.toContain("$");
    expect(html.toLowerCase()).not.toContain("brevity is the soul");
    expect(html).not.toMatch(/<form/i);
    expect(html).not.toMatch(/newsletter/i);
    expect(html.toLowerCase()).not.toContain("gtag");
    expect(html.toLowerCase()).not.toContain("wordle");
  });
});

describe("hosting", () => {
  it("rewrites only /play and leaves the landing page at /", () => {
    const config = JSON.parse(readProject("vercel.json")) as {
      rewrites: { source: string; destination: string }[];
    };
    expect(config.rewrites).toEqual([
      { source: "/play", destination: "/play/index.html" },
      { source: "/play/(.*)", destination: "/play/index.html" },
    ]);
  });

  it("points the play placeholder home", () => {
    const html = readProject("play/index.html");
    expect(html.toLowerCase()).toContain("coming soon");
    expect(html).toContain('href="/"');
  });
});
