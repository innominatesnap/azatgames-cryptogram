import { describe, expect, it } from 'vitest';
import { emptySolveState, setLetter } from '../engine/solve';
import { mergeProgress, readAgeAck, reviveSolveState, writeAgeAck } from './session';

describe('local session', () => {
  it('stores only the 13 plus acknowledgement', () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem(key: string) {
        return mem.has(key) ? mem.get(key) || '' : null;
      },
      setItem(key: string, value: string) {
        mem.set(key, value);
      },
    };
    expect(readAgeAck(storage)).toBe(false);
    writeAgeAck(storage);
    expect(readAgeAck(storage)).toBe(true);
    expect(mem.size).toBe(1);
  });

  it('revives a saved board and merges the further clock with the higher hint count', () => {
    const local = setLetter(emptySolveState(), 4, 'T');
    local.elapsedMs = 5000;
    local.hintsUsed = 0;
    const server = emptySolveState();
    server.elapsedMs = 2000;
    server.hintsUsed = 2;
    server.frequencyShown = true;
    const merged = mergeProgress(local, server);
    expect(merged.present[4]).toBe('T');
    expect(merged.elapsedMs).toBe(5000);
    expect(merged.hintsUsed).toBe(2);
    expect(merged.frequencyShown).toBe(true);
    const revived = reviveSolveState(JSON.parse(JSON.stringify(merged)));
    expect(revived && revived.present[4]).toBe('T');
  });
});
