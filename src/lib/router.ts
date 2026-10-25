import { useSyncExternalStore } from 'react';

export type Route = 'home' | 'meal' | 'workout' | 'session' | 'program' | 'targets' | 'sleep' | 'body' | 'settings' | 'progress' | 'past';
const ROUTES: Route[] = ['home', 'meal', 'workout', 'session', 'program', 'targets', 'sleep', 'body', 'settings', 'progress', 'past'];

function current(): Route {
  const h = location.hash.replace(/^#\/?/, '').split('?')[0];
  return (ROUTES as string[]).includes(h) ? (h as Route) : 'home';
}

export function useRoute(): Route {
  return useSyncExternalStore(
    (l) => {
      window.addEventListener('hashchange', l);
      return () => window.removeEventListener('hashchange', l);
    },
    current,
  );
}

export function go(route: Route, params?: Record<string, string>): void {
  const q = params ? `?${new URLSearchParams(params)}` : '';
  location.hash = route === 'home' ? '/' : `/${route}${q}`;
}

/** A query parameter from the current route, e.g. #/past?id=… */
export function useParam(name: string): string | null {
  const hash = useSyncExternalStore(
    (l) => {
      window.addEventListener('hashchange', l);
      return () => window.removeEventListener('hashchange', l);
    },
    () => location.hash,
  );
  return new URLSearchParams(hash.split('?')[1] ?? '').get(name);
}
