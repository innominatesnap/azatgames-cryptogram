import { useEffect, useMemo, useState } from 'react';
import { createAzatCookieStorage, AUTH_STORAGE_KEY } from '../auth/cookies';
import { hardReset } from '../auth/session';
import { denverDateString } from '../lib/denverDate';
import { formatPreview } from '../engine/cipher';
import type { SolveOutcome } from '../play/api';
import type { PuzzleBundle } from '../play/bundle';
import { createPracticeBundle } from '../play/bundle';
import { runBoot, signOutAndReload } from '../play/boot';
import { pathForStage, routeFromPath, stageNameAfterBoot } from '../play/routes';
import { readAgeAck, writeAgeAck } from '../progress/session';
import { readStats, rememberSolve, summarizeStats, writeStats, type SolveRecord, type StatsSummary } from '../progress/stats';
import type { SolveState } from '../engine/solve';
import { AgeGate, Under13Stop } from './AgeGate';
import { CompleteScreen } from './CompleteScreen';
import { HomeScreen } from './HomeScreen';
import { SolveScreen } from './SolveScreen';
import { Shell, Wordmark } from './chrome';

type Stage =
  | { name: 'age' }
  | { name: 'stop' }
  | { name: 'boot' }
  | { name: 'home' }
  | { name: 'solve' }
  | { name: 'done' };

type Store = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function memoryStore(): Store {
  const mem = new Map<string, string>();
  return {
    getItem(key) {
      return mem.has(key) ? mem.get(key) || '' : null;
    },
    setItem(key, value) {
      mem.set(key, value);
    },
  };
}

function localStore(): Store | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function App() {
  const fallback = useMemo(() => memoryStore(), []);
  const [store, setStore] = useState<Store>(fallback);
  const [stage, setStage] = useState<Stage>(() => {
    try {
      if (typeof window !== 'undefined' && readAgeAck(window.localStorage)) return { name: 'boot' };
    } catch {
      return { name: 'age' };
    }
    return { name: 'age' };
  });
  const [bundle, setBundle] = useState<PuzzleBundle | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [stats, setStats] = useState<StatsSummary>(() => summarizeStats([], denverDateString(new Date())));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const local = localStore();
    const active = local || fallback;
    setStore(active);
    if (local && readAgeAck(local)) setStage({ name: 'boot' });
    setStats(summarizeStats(readStats(active), denverDateString(new Date())));
    setReady(true);
  }, [fallback]);

  useEffect(() => {
    if (!ready || stage.name !== 'boot') return;
    let cancelled = false;
    void runBoot(store).then(
      (result) => {
        if (cancelled) return;
        setBundle(result.bundle);
        setNotice(result.notice);
        setSignedIn(result.signedIn);
        land(Boolean(result.bundle.finished));
      },
      () => {
        if (cancelled) return;
        setBundle(createPracticeBundle(store));
        setNotice('Something went wrong while starting. Practice quote is on this device only.');
        land(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [ready, stage.name, store]);

  useEffect(() => {
    function onPop() {
      setStage((current) => {
        if (current.name === 'age' || current.name === 'stop' || current.name === 'boot') return current;
        const route = routeFromPath(window.location.pathname);
        if (route === 'solve') return { name: 'solve' };
        if (route === 'complete') return { name: 'done' };
        return { name: 'home' };
      });
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function applyStage(name: 'home' | 'solve' | 'done') {
    if (name === 'solve') setStage({ name: 'solve' });
    else if (name === 'done') setStage({ name: 'done' });
    else setStage({ name: 'home' });
  }

  function land(finished: boolean) {
    const landed = stageNameAfterBoot(window.location.pathname, finished);
    if (landed === 'home' && routeFromPath(window.location.pathname) === 'complete') {
      window.history.replaceState({ play: 'home' }, '', '/play');
    }
    applyStage(landed);
  }

  function openStage(name: 'home' | 'solve' | 'done') {
    const path = pathForStage(name);
    if (window.location.pathname !== path) {
      window.history.pushState({ play: name }, '', path);
    }
    applyStage(name);
  }

  function acceptAge() {
    const local = localStore();
    if (local) {
      try {
        writeAgeAck(local);
        setStore(local);
      } catch {
        setStore(fallback);
      }
    }
    setStage({ name: 'boot' });
  }

  function refreshStats(active: Store) {
    setStats(summarizeStats(readStats(active), denverDateString(new Date())));
  }

  function handlePersist(state: SolveState, finished: SolveOutcome | null) {
    if (bundle) bundle.persist(state, finished || bundle.finished);
    setBundle((current) => {
      if (!current) return current;
      return { ...current, initial: state, finished: finished || current.finished };
    });
  }

  function handleDone(outcome: SolveOutcome) {
    if (!bundle) return;
    const record: SolveRecord = {
      puzzleKey: bundle.key,
      date: denverDateString(new Date()),
      stars: outcome.stars,
      elapsedMs: outcome.elapsedMs,
      hintsUsed: outcome.hintsUsed,
      hintPoints: outcome.hintPoints,
      letterCount: outcome.letterCount,
    };
    const next = rememberSolve(readStats(store), record);
    writeStats(store, next);
    refreshStats(store);
    setBundle((current) => (current ? { ...current, finished: outcome } : current));
    openStage('done');
  }

  if (stage.name === 'age') {
    return <AgeGate onAdult={acceptAge} onChild={() => setStage({ name: 'stop' })} />;
  }
  if (stage.name === 'stop') {
    return <Under13Stop onBack={() => setStage({ name: 'age' })} />;
  }
  if (!ready || (stage.name === 'boot' && !bundle)) {
    return (
      <Shell>
        <Wordmark subtitle="Today" />
        <p>Checking Azat sign-in.</p>
      </Shell>
    );
  }
  if (!bundle || stage.name === 'home') {
    return (
      <HomeScreen
        notice={notice}
        preview={bundle ? formatPreview(bundle.words) : ''}
        solved={Boolean(bundle && bundle.finished)}
        stars={bundle && bundle.finished ? bundle.finished.stars : null}
        stats={stats}
        signedIn={signedIn}
        onSolve={() => openStage('solve')}
        onResult={() => openStage('done')}
        onSignOut={() => { void signOutAndReload(); }}
        onHardReset={() => {
          hardReset({
            clearAuth() {
              createAzatCookieStorage().removeItem(AUTH_STORAGE_KEY);
            },
            local: window.localStorage,
            session: window.sessionStorage,
            reload() {
              window.location.reload();
            },
          });
        }}
      />
    );
  }
  if (stage.name === 'solve') {
    return (
      <SolveScreen
        key={bundle.key}
        bundle={bundle}
        notice={notice}
        onPersist={handlePersist}
        onDone={handleDone}
        onHome={() => openStage('home')}
      />
    );
  }
  if (bundle.finished) {
    return (
      <CompleteScreen
        outcome={bundle.finished}
        words={bundle.words}
        notice={notice}
        onHome={() => openStage('home')}
      />
    );
  }
  return (
    <Shell>
      <Wordmark subtitle="Today" />
      <p>That result is not ready.</p>
    </Shell>
  );
}
