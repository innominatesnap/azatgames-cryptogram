import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KEYBOARD_COLUMNS, keyboardRowPlan, scrollDelta } from './scrollTile';

describe('pinned keyboard', () => {
  it('fits the alphabet in four rows of seven, with Delete beside Z', () => {
    const plan = keyboardRowPlan(26, KEYBOARD_COLUMNS);
    expect(plan.letterRows).toBe(4);
    expect(plan.lastRowLetters).toBe(5);
    expect(plan.deleteSharesLastRow).toBe(true);
    const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8');
    expect(css).toContain('grid-template-columns: repeat(7, minmax(0, 1fr))');
    expect(css).toContain('grid-column: span 2');
    expect(css).toMatch(/\.solve-screen\s*\{[^}]*padding-bottom:\s*var\(--keyboard-height/);
    expect(css).toContain('min-height: 48px');
    expect(css).not.toContain('repeat(5');
    expect(css).not.toContain('min-height: 64px');
  });

  it('scrolls a covered tile above the keyboard and leaves a visible tile alone', () => {
    expect(scrollDelta({ top: 520, bottom: 582 }, 540)).toBe(582 - (540 - 8));
    expect(scrollDelta({ top: 120, bottom: 182 }, 540)).toBe(0);
    expect(scrollDelta({ top: -20, bottom: 42 }, 540)).toBe(-28);
  });
});
