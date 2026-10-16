import { storage } from '../services/storage';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { apply, migrate, seed, sweep, type Action, type State } from '../domain/model';
import { collectPhotos } from '../services/photos';

const KEY = 'primerka.local.v1';
type Store = { state: State; ready: boolean; error: string; clearError: () => void; dispatch: (action: Action) => Promise<boolean>; retry: () => void };
const Context = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => seed());
  const current = useRef(state);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    let alive = true;
    storage.getItem(KEY).then(async raw => {
      const loaded = raw ? migrate(JSON.parse(raw)) : seed();
      if (loaded.version !== 2 || !Array.isArray(loaded.groups) || !loaded.people?.some(p => p.id === loaded.activeUserId)) throw new Error('Не удалось прочитать данные.');
      const next = sweep(loaded, Date.now());
      await storage.setItem(KEY, JSON.stringify(next));
      if (alive) { current.current = next; setState(next); setReady(true); collectPhotos(next); }
    }).catch(() => { if (alive) setError('Не удалось открыть локальные данные. Проверьте доступность хранилища браузера или устройства и повторите.'); });
    return () => { alive = false; };
  }, [attempt]);

  const commit = useCallback((action?: Action): Promise<boolean> => {
    const work = queue.current.then(async () => {
      const next = action ? apply(current.current, action) : sweep(current.current, Date.now());
      if (JSON.stringify(next) === JSON.stringify(current.current)) { collectPhotos(next); return true; }
      try { await storage.setItem(KEY, JSON.stringify(next)); }
      catch { throw new Error('Не удалось сохранить изменения. Возможно, хранилище заполнено. Удалите ненужную примерку и повторите.'); }
      current.current = next;
      setState(next);
      // Purge only files in our own photo directory, after a successful state write.
      collectPhotos(next);
      return true;
    }).catch((e: unknown) => { setError(e instanceof Error ? e.message : 'Не удалось выполнить действие.'); return false; });
    queue.current = work;
    return work;
  }, []);

  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(() => { void commit(); }, 5000);
    const subscription = AppState.addEventListener('change', value => { if (value === 'active') void commit(); });
    return () => { clearInterval(interval); subscription.remove(); };
  }, [commit, ready]);
  return <Context.Provider value={{ state, ready, error, clearError: () => setError(''), dispatch: commit, retry: () => setAttempt(a => a + 1) }}>{children}</Context.Provider>;
}

export function useStore() {
  const store = useContext(Context);
  if (!store) throw new Error('StoreProvider is missing');
  return store;
}
export function useClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const interval = setInterval(tick, 1000);
    const sub = AppState.addEventListener('change', tick);
    return () => { clearInterval(interval); sub.remove(); };
  }, []);
  return now;
}
