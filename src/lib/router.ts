import { useSyncExternalStore } from 'react';

export type Route = 'home' | 'meal' | 'workout' | 'sleep' | 'body' | 'settings';
const ROUTES: Route[] = ['home', 'meal', 'workout', 'sleep', 'body', 'settings'];

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

export function go(route: Route): void {
  location.hash = route === 'home' ? '/' : `/${route}`;
}
