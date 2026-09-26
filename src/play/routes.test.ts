import { describe, expect, it } from 'vitest';
import { ensurePlayLocation, pathForStage, routeFromPath, stageNameAfterBoot } from './routes';

describe('play routes', () => {
  it('keeps home, solve, and complete under /play', () => {
    expect(pathForStage('home')).toBe('/play');
    expect(pathForStage('solve')).toBe('/play/solve');
    expect(pathForStage('done')).toBe('/play/complete');
    expect(routeFromPath('/play')).toBe('home');
    expect(routeFromPath('/play/')).toBe('home');
    expect(routeFromPath('/play/solve')).toBe('solve');
    expect(routeFromPath('/play/complete/')).toBe('complete');
    expect(routeFromPath('/play/later')).toBe('home');
  });

  it('opens a finished deep link on the result and leaves an unfinished one on today', () => {
    expect(stageNameAfterBoot('/play/solve', false)).toBe('solve');
    expect(stageNameAfterBoot('/play/complete', true)).toBe('done');
    expect(stageNameAfterBoot('/play/complete', false)).toBe('home');
    expect(stageNameAfterBoot('/play', false)).toBe('home');
  });

  it('sends a page outside /play back to the game', () => {
    let landed = '';
    ensurePlayLocation({
      pathname: '/',
      origin: 'https://cryptogram.azat.games',
      replace(url: string) {
        landed = url;
      },
    });
    expect(landed).toBe('https://cryptogram.azat.games/play');
    landed = '';
    ensurePlayLocation({
      pathname: '/play/solve',
      origin: 'https://cryptogram.azat.games',
      replace(url: string) {
        landed = url;
      },
    });
    expect(landed).toBe('');
  });
});
