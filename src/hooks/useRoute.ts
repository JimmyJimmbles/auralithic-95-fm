import { useEffect, useState } from 'react';
import { artistSlugFromHost } from '../lib/site.ts';

export type Route =
  | { view: 'station' }
  | { view: 'artists' }
  | { view: 'artist'; slug: string }
  | { view: 'radio'; slug: string }
  | { view: 'admin' };

export const parseLocation = (hostname = window.location.hostname, path = window.location.pathname): Route => {
  const value = path.replace(/\/+$/, '') || '/';
  const artistSlug = artistSlugFromHost(hostname);
  if (artistSlug) {
    if (value === '/catalog') return { view: 'artist', slug: artistSlug };
    return { view: 'radio', slug: artistSlug };
  }
  if (value === '/artists') return { view: 'artists' };
  if (value === '/admin') return { view: 'admin' };
  return { view: 'station' };
};

export const navigate = (path: string) => {
  if (window.location.pathname !== path) window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

const subscribers = new Set<() => void>();

const notify = () => {
  subscribers.forEach((listener) => listener());
};

if (typeof document !== 'undefined') {
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target instanceof Element ? event.target.closest('a') : null;
    if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
    const url = new URL(anchor.href, window.location.origin);
    if (url.origin !== window.location.origin) return;
    event.preventDefault();
    if (url.pathname !== window.location.pathname) window.history.pushState(null, '', `${url.pathname}${url.search}`);
    notify();
  });
  window.addEventListener('popstate', notify);
}

export const useRoute = (): Route => {
  const [route, setRoute] = useState<Route>(() => parseLocation());
  useEffect(() => {
    const sync = () => setRoute(parseLocation());
    subscribers.add(sync);
    return () => {
      subscribers.delete(sync);
    };
  }, []);
  return route;
};
