import { describe, expect, it } from 'vitest';
import { denverDateString, previousDate, shiftDate } from './denverDate';

describe('denver dates', () => {
  it('uses the America/Denver calendar day', () => {
    expect(denverDateString(new Date('2026-01-01T06:30:00Z'))).toBe('2025-12-31');
    expect(denverDateString(new Date('2026-07-01T05:30:00Z'))).toBe('2026-06-30');
    expect(denverDateString(new Date('2026-07-01T06:30:00Z'))).toBe('2026-07-01');
  });

  it('steps calendar dates without drifting', () => {
    expect(previousDate('2026-03-01')).toBe('2026-02-28');
    expect(shiftDate('2026-01-01', -6)).toBe('2025-12-26');
  });
});
