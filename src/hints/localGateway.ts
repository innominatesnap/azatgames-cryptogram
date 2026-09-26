import type { Mapping } from '../engine/solve';
import { chooseFindMistake, chooseReveal, NO_MISTAKE_NOTE } from './select';
import type { Attribution, HintRecord } from './records';
import type { HintBoardState, HintEffect, HintGateway } from './types';

function withUse(state: HintBoardState, id: string, action: string): { hintsUsed: number; hintLog: HintRecord[] } {
  return {
    hintsUsed: state.hintsUsed + 1,
    hintLog: state.hintLog.concat([{ id: id, action: action }]),
  };
}

export function createLocalGateway(input: {
  solution: Mapping;
  attribution: Attribution;
  random?: () => number;
}): HintGateway {
  const random = input.random || Math.random;
  return {
    async request(id, state) {
      return localHintEffect(id, state, input.solution, input.attribution, random);
    },
  };
}

export function localHintEffect(
  id: string,
  state: HintBoardState,
  solution: Mapping,
  attribution: Attribution,
  random: () => number,
): HintEffect {
  if (id === 'unveil-attribution') {
    if (state.attributionUnveiled) {
      return {
        action: 'unveil',
        id: id,
        attribution: attribution,
        hintsUsed: state.hintsUsed,
        hintLog: state.hintLog,
        note: 'Author and source are already unveiled.',
      };
    }
    const used = withUse(state, id, 'unveil');
    return {
      action: 'unveil',
      id: id,
      attribution: attribution,
      hintsUsed: used.hintsUsed,
      hintLog: used.hintLog,
      note: 'Author and source unveiled.',
    };
  }
  if (id === 'find-mistake') {
    const choice = chooseFindMistake(state.mapping, solution, random);
    if (choice.kind === 'none') {
      return {
        action: 'none',
        id: id,
        hintsUsed: state.hintsUsed,
        hintLog: state.hintLog,
        note: 'Nothing left to reveal.',
      };
    }
    if (choice.kind === 'mark') {
      const used = withUse(state, id, 'mark');
      return {
        action: 'mark',
        id: id,
        number: choice.number,
        hintsUsed: used.hintsUsed,
        hintLog: used.hintLog,
        note: 'One wrong letter is marked.',
      };
    }
    const used = withUse(state, id, 'reveal');
    return {
      action: 'reveal',
      id: id,
      number: choice.number,
      letter: choice.letter,
      fallback: true,
      hintsUsed: used.hintsUsed,
      hintLog: used.hintLog,
      note: NO_MISTAKE_NOTE,
    };
  }
  if (id === 'reveal-letter') {
    const choice = chooseReveal(state.mapping, solution, random);
    if (!choice) {
      return {
        action: 'none',
        id: id,
        hintsUsed: state.hintsUsed,
        hintLog: state.hintLog,
        note: 'Nothing left to reveal.',
      };
    }
    const used = withUse(state, id, 'reveal');
    return {
      action: 'reveal',
      id: id,
      number: choice.number,
      letter: choice.letter,
      fallback: false,
      hintsUsed: used.hintsUsed,
      hintLog: used.hintLog,
      note: 'A letter is filled in.',
    };
  }
  return {
    action: 'none',
    id: id,
    hintsUsed: state.hintsUsed,
    hintLog: state.hintLog,
    note: 'That hint is not in the catalog.',
  };
}
