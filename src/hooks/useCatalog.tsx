import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { emptyCatalog, mapCatalog, type ApiCatalog, type CatalogData } from '../data/catalog.ts';

const CatalogContext = createContext<CatalogData>(emptyCatalog);

const isCatalog = (value: unknown): value is ApiCatalog => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<ApiCatalog>;
  return Array.isArray(record.artists) && Array.isArray(record.releases) && Array.isArray(record.tracks);
};

export const CatalogProvider = ({ children }: { children: ReactNode }) => {
  const [catalog, setCatalog] = useState<CatalogData>(emptyCatalog);

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      try {
        const response = await fetch('/api/catalog', { cache: 'no-store' });
        if (!response.ok) throw new Error('Catalog unavailable');
        const body: unknown = await response.json();
        if (!isCatalog(body)) throw new Error('Catalog unavailable');
        if (!cancel) setCatalog(mapCatalog(body));
      } catch {
        if (!cancel) setCatalog({ ...emptyCatalog, ready: true });
      }
    };
    void load();
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    window.addEventListener('popstate', onFocus);
    window.addEventListener('auralithic-catalog', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      cancel = true;
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('popstate', onFocus);
      window.removeEventListener('auralithic-catalog', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  return <CatalogContext.Provider value={catalog}>{children}</CatalogContext.Provider>;
};

export const requestCatalogRefresh = () => {
  window.dispatchEvent(new Event('auralithic-catalog'));
};

export const useCatalog = (): CatalogData => useContext(CatalogContext);
