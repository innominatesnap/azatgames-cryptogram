import type { CryptogramClient } from '../lib/supabaseClient';
import type { Word } from '../engine/cipher';
import type { SolveState } from '../engine/solve';
import { mergeProgress, readSavedSession, writeSavedSession } from '../progress/session';
import { SAMPLE_KEY } from '../data/sample';
import type { PuzzleApi, SolveOutcome } from './api';
import { fetchAttempt, fetchSolvedSummary, fetchTodayPuzzle, saveLiveProgress, createLiveApi } from './live';
import { boardFromSolve, newRequestId } from '../hints/board';
import { applyHintEffect } from '../hints/apply';
import { createLocalGateway } from '../hints/localGateway';
import { sampleQuote } from './practice';
import {
  practiceCheck,
  practiceConfirm,
  practiceFrequency,
  practiceGiveUp,
  practiceReveal,
  samplePuzzle,
} from './practice';

export type PuzzleBundle = {
  key: string;
  mode: 'practice' | 'live';
  dateLabel: string;
  words: Word[];
  uniqueLetterCount: number;
  letterCount: number;
  longestWord: number;
  api: PuzzleApi;
  initial: SolveState;
  finished: SolveOutcome | null;
  persist: (state: SolveState, finished: SolveOutcome | null) => void;
};

type Store = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function createPracticeBundle(storage: Store): PuzzleBundle {
  const built = samplePuzzle();
  const quote = sampleQuote();
  const saved = readSavedSession(storage, SAMPLE_KEY);
  const gateway = createLocalGateway({ solution: built.solution, attribution: quote, puzzleKey: SAMPLE_KEY });
  const api: PuzzleApi = {
    async requestHint(id, state, requestId, extra) {
      return gateway.request(id, state, requestId, extra);
    },
    async check(mapping, hintsUsed) {
      return practiceCheck(built.solution, mapping, hintsUsed);
    },
    async reveal(number, mapping, hintsUsed, revealedNumbers) {
      return practiceReveal({
        solution: built.solution,
        mapping: mapping,
        number: number,
        hintsUsed: hintsUsed,
        revealedNumbers: revealedNumbers,
      });
    },
    async useFrequency(hintsUsed, alreadyShown) {
      return practiceFrequency(hintsUsed, alreadyShown);
    },
    async confirm(mapping, elapsedMs, hintsUsed, hintPoints, hintLog) {
      return practiceConfirm({
        words: built.words,
        solution: built.solution,
        mapping: mapping,
        elapsedMs: elapsedMs,
        hintsUsed: hintsUsed,
        hintPoints: hintPoints,
        uniqueLetterCount: built.uniqueLetterCount,
        longestWord: built.longestWord,
        letterCount: built.letterCount,
        dateLabel: 'Sample',
        hintLog: hintLog,
      });
    },
    async giveUp(elapsedMs, hintsUsed, hintPoints, hintLog) {
      return practiceGiveUp({
        elapsedMs: elapsedMs,
        hintsUsed: hintsUsed,
        hintPoints: hintPoints,
        letterCount: built.letterCount,
        dateLabel: 'Sample',
        hintLog: hintLog,
      });
    },
  };
  return {
    key: SAMPLE_KEY,
    mode: 'practice',
    dateLabel: 'Sample',
    words: built.words,
    uniqueLetterCount: built.uniqueLetterCount,
    letterCount: built.letterCount,
    longestWord: built.longestWord,
    api: api,
    initial: saved.state,
    finished: saved.finished,
    persist(state, finished) {
      writeSavedSession(storage, SAMPLE_KEY, state, finished);
    },
  };
}

async function restoreAttribution(
  api: PuzzleApi,
  state: SolveState,
  words: Word[],
  puzzleKey: string,
  uniqueLetterCount: number,
): Promise<SolveState> {
  let next = state;
  try {
    if (next.attributionStage >= 1 && (!next.attribution || !next.attribution.author)) {
      const effect = await api.requestHint(
        'unveil-author',
        boardFromSolve(next, words, puzzleKey, uniqueLetterCount),
        newRequestId(),
      );
      if (effect.action === 'author') next = applyHintEffect(next, effect).state;
    }
    if (next.attributionStage >= 2 && (!next.attribution || !next.attribution.work)) {
      const effect = await api.requestHint(
        'unveil-source',
        boardFromSolve(next, words, puzzleKey, uniqueLetterCount),
        newRequestId(),
      );
      if (effect.action === 'source') next = applyHintEffect(next, effect).state;
    }
  } catch {
    return state;
  }
  return next;
}

export async function createLiveBundle(
  client: CryptogramClient,
  userId: string,
  storage: Store,
): Promise<PuzzleBundle> {
  const today = await fetchTodayPuzzle(client);
  const attempt = await fetchAttempt(client, today.row.id);
  const saved = readSavedSession(storage, today.row.id);
  let initial = mergeProgress(saved.state, attempt);
  const finished = attempt.solved
    ? await fetchSolvedSummary(client, today.row.id, today.row.puzzle_date, today.counts.letterCount)
    : null;
  const api = createLiveApi(client, today.row.id, today.row.puzzle_date, today.counts.letterCount);
  initial = await restoreAttribution(api, initial, today.words, today.row.id, today.counts.uniqueLetterCount);
  return {
    key: today.row.id,
    mode: 'live',
    dateLabel: today.row.puzzle_date,
    words: today.words,
    uniqueLetterCount: today.counts.uniqueLetterCount,
    letterCount: today.counts.letterCount,
    longestWord: today.counts.longestWord,
    api: api,
    initial: initial,
    finished: finished,
    persist(state, done) {
      writeSavedSession(storage, today.row.id, state, done);
      void saveLiveProgress(client, userId, today.row.id, state).catch(() => undefined);
    },
  };
}
