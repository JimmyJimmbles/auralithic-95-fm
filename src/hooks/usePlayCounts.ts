import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogData } from '../data/catalog.ts';

export const usePlayCounts = (catalog: CatalogData) => {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const sessions = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!catalog.ready) return;
    setCounts((current) => {
      const next = { ...current };
      for (const track of catalog.tracks) next[track.id] = Math.max(track.streams, current[track.id] ?? 0);
      return next;
    });
  }, [catalog]);

  const beginPlay = useCallback((id: string) => {
    void fetch('/api/plays', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ trackId: id }),
    }).then(async (response) => {
      if (!response.ok) return;
      const body = await response.json() as { id: string };
      sessions.current[id] = body.id;
    }).catch(() => undefined);
  }, []);

  const recordPlay = useCallback((id: string) => {
    const playbackId = sessions.current[id];
    if (!playbackId) return;
    delete sessions.current[id];
    void fetch(`/api/plays/${playbackId}/qualify`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }).then(async (response) => {
      if (!response.ok) return;
      const body = await response.json() as { streams: number };
      setCounts((current) => ({ ...current, [id]: body.streams }));
    }).catch(() => undefined);
  }, []);

  return { counts, beginPlay, recordPlay };
};
