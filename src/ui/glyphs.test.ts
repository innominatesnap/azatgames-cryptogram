import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPTY_SLOT_DASH, letterSlotFace } from "./glyphs";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("empty letter slots", () => {
  it("shows a centered en dash until a letter is filled", () => {
    expect(EMPTY_SLOT_DASH).toBe("\u2013");
    expect(letterSlotFace("")).toBe(EMPTY_SLOT_DASH);
    expect(letterSlotFace("A")).toBe("A");
    expect(letterSlotFace("A").includes(EMPTY_SLOT_DASH)).toBe(false);
  });

  it("renders the dash in the letter glyph and punctuation on the baseline", () => {
    const board = read("./PuzzleBoard.tsx");
    const playCss = read("./app.css");
    const demo = read("../landing/Demo.tsx");
    const landingCss = read("../landing/styles.css");

    expect(board).toContain("letterSlotFace");
    expect(board).toContain("tile-dash");
    expect(board).toContain("tile-punct");
    expect(demo).toContain("slot-dash");
    expect(demo).toContain("EMPTY_SLOT_DASH");
    expect(demo).toContain("mark-glyph");

    expect(playCss).toMatch(/\.tile-glyph\s*\{[^}]*align-items:\s*center/);
    expect(playCss).toMatch(/\.tile-punct\s*\{[^}]*align-items:\s*flex-end/);
    expect(landingCss).toMatch(/\.glyph\s*\{[^}]*place-items:\s*center/);
    expect(landingCss).toMatch(/\.mark-glyph\s*\{[^}]*place-items:\s*end center/);
  });
});

describe("Azat Games color tokens", () => {
  it("defines the hub palette once and both screens use those names", () => {
    const theme = read("../theme.css");
    const playCss = read("./app.css");
    const landingCss = read("../landing/styles.css");
    const required = [
      "--bg-base: #060916",
      "--bg-panel: #0b1024",
      "--bg-elevated: #131a36",
      "--text-main: #e8ecff",
      "--text-muted: #8791b3",
      "--text-dim: #5c6690",
      "--accent-blue: #4f7cff",
      "--accent-cyan: #22d3ee",
      "#2563eb",
      "#3b82f6",
      "#06b6d4",
    ];
    for (const token of required) {
      expect(theme).toContain(token);
      expect(playCss).not.toContain(token);
      expect(landingCss).not.toContain(token);
    }
    expect(playCss).toContain("../theme.css");
    expect(landingCss).toContain("../theme.css");
    expect(playCss).toContain("var(--bg-base)");
    expect(playCss).toContain("var(--accent-blue)");
    expect(playCss).toContain("var(--accent-cyan)");
    expect(landingCss).toContain("var(--bg-base)");
    expect(landingCss).toContain("var(--text-main)");
    expect(playCss).not.toContain("#e2b657");
    expect(playCss).not.toContain("#100e0b");
    expect(landingCss).not.toContain("#f5b043");
    expect(landingCss).not.toContain("--gold");
    expect(playCss).toMatch(/\.tile-current\s*\{[^}]*var\(--accent-blue\)/);
  });
});
