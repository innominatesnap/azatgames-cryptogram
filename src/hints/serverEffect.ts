import type { HintRecord } from './records';
import type { HintEffect } from './types';

function readLog(raw: unknown, fallback: HintRecord[]): HintRecord[] {
  if (!Array.isArray(raw)) return fallback;
  const next: HintRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { [key: string]: unknown };
    if (typeof row.id !== 'string' || !row.id) continue;
    next.push({ id: row.id, action: typeof row.action === 'string' ? row.action : '' });
  }
  return next;
}

function readNumber(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isInteger(raw) ? raw : null;
}

/**
 * Copy only the fields a hint is allowed to reveal.
 * Plain text, the full solution, and unused letters are dropped.
 */
export function effectFromServer(
  raw: unknown,
  requestedId: string,
  hintsUsed: number,
  hintLog: HintRecord[],
): HintEffect {
  const row = (raw && typeof raw === 'object' ? raw : {}) as { [key: string]: unknown };
  const id = typeof row.hintType === 'string' ? row.hintType : requestedId;
  const action = typeof row.action === 'string' ? row.action : 'none';
  const used = typeof row.hintsUsed === 'number' ? row.hintsUsed : hintsUsed;
  const log = readLog(row.hintLog, hintLog);
  const note = typeof row.note === 'string' ? row.note : '';
  if (action === 'mark') {
    const number = readNumber(row.number);
    if (number === null) {
      return { action: 'none', id: id, hintsUsed: used, hintLog: log, note: note || 'No letter was marked.' };
    }
    return { action: 'mark', id: id, number: number, hintsUsed: used, hintLog: log, note: note };
  }
  if (action === 'reveal') {
    const number = readNumber(row.number);
    const letter = typeof row.letter === 'string' ? row.letter.toUpperCase() : '';
    if (number === null || letter.length !== 1) {
      return { action: 'none', id: id, hintsUsed: used, hintLog: log, note: note || 'No letter was revealed.' };
    }
    return {
      action: 'reveal',
      id: id,
      number: number,
      letter: letter,
      fallback: row.fallback === true,
      hintsUsed: used,
      hintLog: log,
      note: note,
    };
  }
  if (action === 'unveil') {
    const author = typeof row.author === 'string' ? row.author : '';
    const work = typeof row.work === 'string' ? row.work : '';
    const year = typeof row.year === 'number' ? row.year : 0;
    const sourceNote = typeof row.sourceNote === 'string' ? row.sourceNote : '';
    return {
      action: 'unveil',
      id: id,
      attribution: { author: author, work: work, year: year, sourceNote: sourceNote },
      hintsUsed: used,
      hintLog: log,
      note: note,
    };
  }
  return { action: 'none', id: id, hintsUsed: used, hintLog: log, note: note };
}
