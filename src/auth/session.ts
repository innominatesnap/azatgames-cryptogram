export const SESSION_TIMEOUT_MS = 8000;
export const SIGN_OUT_TIMEOUT_MS = 1500;

export class TimeoutError extends Error {
  constructor() {
    super('timeout');
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError());
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function readSession(
  getSession: () => Promise<{ data: { session: unknown } }>,
  timeoutMs: number = SESSION_TIMEOUT_MS,
): Promise<'session' | 'none' | 'timeout'> {
  try {
    const result = await withTimeout(getSession(), timeoutMs);
    if (result.data.session) return 'session';
    return 'none';
  } catch (error) {
    if (error instanceof TimeoutError) return 'timeout';
    throw error;
  }
}

export async function signOutLocal(deps: {
  clearAuth: () => void;
  signOut: () => Promise<unknown>;
  timeoutMs?: number;
}): Promise<void> {
  deps.clearAuth();
  try {
    await withTimeout(deps.signOut(), deps.timeoutMs ?? SIGN_OUT_TIMEOUT_MS);
  } catch {
    return;
  }
}

export function hardReset(deps: {
  clearAuth: () => void;
  local: { clear(): void };
  session: { clear(): void };
  reload: () => void;
}): void {
  deps.clearAuth();
  deps.local.clear();
  deps.session.clear();
  deps.reload();
}
