import type { HintRecord } from './records';
import type { HintBoardState, HintEffect } from './types';

function readLog(raw: unknown, fallback: HintRecord[]): HintRecord[] {
  if (!Array.isArray(raw)) return fallback;
  const next: HintRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { [key: string]: unknown };
    if (typeof row.id !== 'string' || !row.id) continue;
    next.push({
      id: row.id,
      action: typeof row.action === 'string' ? row.action : '',
      cost: typeof row.cost === 'number' ? row.cost : 0,
      requestId: typeof row.requestId === 'string' ? row.requestId : '',
    });
  }
  return next;
}

function readNumbers(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const next: number[] = [];
  for (const value of raw) {
    if (typeof value === 'number' && Number.isInteger(value)) next.push(value);
  }
  return next;
}

function readLetters(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const next: string[] = [];
  for (const value of raw) {
    if (typeof value === 'string' && value.length === 1) next.push(value.toUpperCase());
  }
  return next;
}

/**
 * Copy only the fields a hint is allowed to reveal.
 * Plain text, the full solution, and a source before it is bought are dropped.
 * C9: this parser does not read a wrong-letter count from confirm_solve.
 */
export function effectFromServer(raw: unknown, requestedId: string, state: HintBoardState): HintEffect {
  const row = (raw && typeof raw === 'object' ? raw : {}) as { [key: string]: unknown };
  const id = typeof row.hintType === 'string' ? row.hintType : requestedId;
  const actionRaw = typeof row.action === 'string' ? row.action : 'none';
  const action = actionRaw === 'mark' || actionRaw === 'reveal' || actionRaw === 'cross-off'
    || actionRaw === 'frequency' || actionRaw === 'author' || actionRaw === 'source'
    ? actionRaw
    : 'none';
  const used = typeof row.hintsUsed === 'number' ? row.hintsUsed : state.hintsUsed;
  const points = typeof row.hintPoints === 'number' ? row.hintPoints : state.hintPoints;
  const log = readLog(row.hintLog, state.hintLog);
  const note = typeof row.note === 'string' ? row.note : '';
  const charged = row.charged === true;
  const cost = typeof row.cost === 'number' ? row.cost : 0;
  const numbers = readNumbers(row.numbers);
  if (!numbers.length && typeof row.number === 'number') numbers.push(row.number);
  return {
    action: action,
    id: id,
    charged: charged,
    cost: cost,
    hintsUsed: used,
    hintPoints: points,
    hintLog: log,
    note: note,
    numbers: numbers,
    letter: typeof row.letter === 'string' ? row.letter.toUpperCase() : '',
    letters: readLetters(row.letters),
    author: action === 'author' && typeof row.author === 'string' ? row.author : '',
    work: action === 'source' && typeof row.work === 'string' ? row.work : '',
    year: action === 'source' && typeof row.year === 'number' ? row.year : 0,
  };
}
