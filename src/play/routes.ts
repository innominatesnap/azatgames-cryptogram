export function pathForStage(name: 'home' | 'solve' | 'done'): string {
  if (name === 'solve') return '/play/solve';
  if (name === 'done') return '/play/complete';
  return '/play';
}

export function routeFromPath(pathname: string): 'home' | 'solve' | 'complete' {
  let path = pathname;
  if (path.length > 1 && path.charAt(path.length - 1) === '/') path = path.slice(0, -1);
  if (path === '/play/solve') return 'solve';
  if (path === '/play/complete') return 'complete';
  return 'home';
}

export function stageNameAfterBoot(pathname: string, finished: boolean): 'home' | 'solve' | 'done' {
  const route = routeFromPath(pathname);
  if (route === 'solve') return 'solve';
  if (route === 'complete' && finished) return 'done';
  return 'home';
}

export function ensurePlayLocation(location: {
  pathname: string;
  origin: string;
  replace(url: string): void;
}): void {
  const path = location.pathname;
  const onPlay = path === '/play' || path.indexOf('/play/') === 0;
  if (onPlay) return;
  location.replace(location.origin + '/play');
}
