import type { Mapping } from '../engine/solve';
import { hintSpec, revealCapFor } from './config';
import { baseEffect, charge } from './effect';
import type { Attribution } from './records';
import {
  crossOffBatch,
  crossSeed,
  markSeed,
  pickCrossOff,
  pickMarkOne,
  pickSurprise,
  placedCount,
  surpriseSeed,
  unavailableReason,
  unsolvedNumbers,
  unusedLetters,
  wrongPlacedNumbers,
} from './rules';
import type { HintBoardState, HintEffect, HintExtra, HintGateway } from './types';

export function createLocalGateway(input: {
  solution: Mapping;
  attribution: Attribution;
  puzzleKey: string;
}): HintGateway {
  return {
    async request(id, state, requestId, extra) {
      const replay = replayed(state, requestId);
      if (replay) return replay;
      return localHintEffect(id, state, input.solution, input.attribution, input.puzzleKey, requestId, extra);
    },
  };
}

function replayed(state: HintBoardState, requestId: string): HintEffect | null {
  if (!requestId) return null;
  for (const row of state.hintLog) {
    if (row.requestId === requestId) return baseEffect(state, row.id, 'Already applied.');
  }
  return null;
}

export function localHintEffect(
  id: string,
  state: HintBoardState,
  solution: Mapping,
  attribution: Attribution,
  puzzleKey: string,
  requestId: string,
  extra?: HintExtra,
): HintEffect {
  const spec = hintSpec(id);
  if (!spec) return baseEffect(state, id, 'That hint is not in the catalog.');
  if (spec.stub) return baseEffect(state, id, 'Not in this version.');
  const blocked = unavailableReason(id, state);
  if (blocked && id !== 'frequency-chart') return baseEffect(state, id, blocked);

  if (id === 'frequency-chart') {
    if (state.frequencyShown) {
      const effect = baseEffect(state, id, 'The chart is open.');
      effect.action = 'frequency';
      return effect;
    }
    const paid = charge(state, id, 'frequency', spec.price, requestId);
    const effect = baseEffect(state, id, 'Frequency chart opened.');
    effect.action = 'frequency';
    effect.charged = true;
    effect.cost = spec.price;
    effect.hintsUsed = paid.hintsUsed;
    effect.hintPoints = paid.hintPoints;
    effect.hintLog = paid.hintLog;
    return effect;
  }

  if (id === 'mark-one' || id === 'check-all') {
    if (placedCount(state.mapping) === 0) return baseEffect(state, id, 'Place a letter first.');
    const wrong = wrongPlacedNumbers(state.mapping, solution);
    if (!wrong.length) {
      const paid = charge(state, id, 'mark', spec.price, requestId);
      const effect = baseEffect(state, id, 'Every letter you have placed so far is right.');
      effect.action = 'mark';
      effect.charged = true;
      effect.cost = spec.price;
      effect.hintsUsed = paid.hintsUsed;
      effect.hintPoints = paid.hintPoints;
      effect.hintLog = paid.hintLog;
      return effect;
    }
    if (id === 'mark-one') {
      const number = pickMarkOne({
        wrong: wrong,
        alreadyMarked: state.markedNumbers,
        seed: markSeed(state, puzzleKey),
      });
      if (number === null) return baseEffect(state, id, 'Those wrong letters are already marked.');
      const paid = charge(state, id, 'mark', spec.price, requestId);
      const effect = baseEffect(state, id, 'One wrong letter marked. Other letters may still be wrong.');
      effect.action = 'mark';
      effect.charged = true;
      effect.cost = spec.price;
      effect.numbers = [number];
      effect.hintsUsed = paid.hintsUsed;
      effect.hintPoints = paid.hintPoints;
      effect.hintLog = paid.hintLog;
      return effect;
    }
    const paid = charge(state, id, 'mark', spec.price, requestId);
    const effect = baseEffect(state, id, String(wrong.length) + (wrong.length === 1 ? ' wrong letter marked.' : ' wrong letters marked.'));
    effect.action = 'mark';
    effect.charged = true;
    effect.cost = spec.price;
    effect.numbers = wrong;
    effect.hintsUsed = paid.hintsUsed;
    effect.hintPoints = paid.hintPoints;
    effect.hintLog = paid.hintLog;
    return effect;
  }

  if (id === 'cross-off') {
    const left = unusedLetters(solution, state.crossedOff);
    if (!left.length) return baseEffect(state, id, 'Nothing left to cross off.');
    const letters = pickCrossOff({ unused: left, seed: crossSeed(state, puzzleKey), batch: crossOffBatch() });
    const paid = charge(state, id, 'cross-off', spec.price, requestId);
    const effect = baseEffect(state, id, 'Crossed off: ' + letters.join(', ') + '.');
    effect.action = 'cross-off';
    effect.charged = true;
    effect.cost = spec.price;
    effect.letters = letters;
    effect.hintsUsed = paid.hintsUsed;
    effect.hintPoints = paid.hintPoints;
    effect.hintLog = paid.hintLog;
    return effect;
  }

  if (id === 'surprise-letter') {
    const number = pickSurprise({
      numbers: unsolvedNumbers(state.mapping, solution),
      seed: surpriseSeed(state, puzzleKey),
    });
    if (number === null) return baseEffect(state, id, 'Nothing left to reveal.');
    const paid = charge(state, id, 'reveal', spec.price, requestId);
    const effect = baseEffect(state, id, 'Revealed: ' + String(number) + ' is ' + solution[number] + '.');
    effect.action = 'reveal';
    effect.charged = true;
    effect.cost = spec.price;
    effect.numbers = [number];
    effect.letter = solution[number];
    effect.hintsUsed = paid.hintsUsed;
    effect.hintPoints = paid.hintPoints;
    effect.hintLog = paid.hintLog;
    return effect;
  }

  if (id === 'pick-letter') {
    const number = extra && extra.number;
    if (!number || !solution[number]) return baseEffect(state, id, 'Tap a letter in this puzzle.');
    if (state.revealedNumbers.indexOf(number) !== -1) return baseEffect(state, id, 'That letter is already revealed.');
    if (state.revealedNumbers.length >= revealCapFor(state.uniqueLetterCount)) {
      return baseEffect(state, id, 'Reveal limit reached.');
    }
    const paid = charge(state, id, 'reveal', spec.price, requestId);
    const effect = baseEffect(state, id, 'Revealed: ' + String(number) + ' is ' + solution[number] + '.');
    effect.action = 'reveal';
    effect.charged = true;
    effect.cost = spec.price;
    effect.numbers = [number];
    effect.letter = solution[number];
    effect.hintsUsed = paid.hintsUsed;
    effect.hintPoints = paid.hintPoints;
    effect.hintLog = paid.hintLog;
    return effect;
  }

  if (id === 'unveil-author') {
    if (state.attributionStage >= 1) {
      const effect = baseEffect(state, id, 'Author already unveiled.');
      effect.action = 'author';
      effect.author = attribution.author;
      return effect;
    }
    const paid = charge(state, id, 'author', spec.price, requestId);
    const effect = baseEffect(state, id, 'Author unveiled.');
    effect.action = 'author';
    effect.charged = true;
    effect.cost = spec.price;
    effect.author = attribution.author;
    effect.hintsUsed = paid.hintsUsed;
    effect.hintPoints = paid.hintPoints;
    effect.hintLog = paid.hintLog;
    return effect;
  }

  if (id === 'unveil-source') {
    if (state.attributionStage < 1) return baseEffect(state, id, 'Unveil the author first.');
    if (state.attributionStage >= 2) {
      const effect = baseEffect(state, id, 'Source already unveiled.');
      effect.action = 'source';
      effect.work = attribution.work;
      effect.year = attribution.year;
      return effect;
    }
    const paid = charge(state, id, 'source', spec.price, requestId);
    const effect = baseEffect(state, id, 'Source unveiled.');
    effect.action = 'source';
    effect.charged = true;
    effect.cost = spec.price;
    effect.work = attribution.work;
    effect.year = attribution.year;
    effect.hintsUsed = paid.hintsUsed;
    effect.hintPoints = paid.hintPoints;
    effect.hintLog = paid.hintLog;
    return effect;
  }

  return baseEffect(state, id, 'That hint is not in the catalog.');
}
