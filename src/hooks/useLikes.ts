import { useCallback, useEffect, useMemo, useState } from 'react';
import { readStringList, writeStorage } from '../lib/storage.ts';

export type LikeStore = {
  liked: (id: string) => boolean;
  likeCount: (id: string) => number;
  toggleLike: (id: string) => void;
};

type LikeRow = { total: number; liked: boolean };

export const useLikes = (): LikeStore => {
  const [rows, setRows] = useState<Record<string, LikeRow>>({});
  const [localLiked, setLocalLiked] = useState<ReadonlySet<string>>(() => new Set(readStringList('likes')));

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      try {
        const response = await fetch('/api/likes', { credentials: 'include', cache: 'no-store' });
        if (!response.ok) return;
        const body = await response.json() as Record<string, LikeRow>;
        if (!cancel) setRows(body);
      } catch {
        // The heart still reflects this browser if the count cannot load.
      }
    };
    void load();
    return () => {
      cancel = true;
    };
  }, []);

  const toggleLike = useCallback((id: string) => {
    const row = rows[id] ?? { total: 0, liked: false };
    const liked = !(row.liked || localLiked.has(id));
    setLocalLiked((stored) => {
      const next = new Set(stored);
      if (liked) next.add(id);
      else next.delete(id);
      writeStorage('likes', [...next]);
      return next;
    });
    setRows((current) => ({
      ...current,
      [id]: { liked, total: Math.max(0, (current[id]?.total ?? row.total) + (liked ? 1 : -1)) },
    }));
    void fetch(`/api/likes/${encodeURIComponent(id)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ liked }),
    }).then(async (response) => {
      if (!response.ok) return;
      const saved = await response.json() as LikeRow;
      setRows((latest) => ({ ...latest, [id]: saved }));
    }).catch(() => undefined);
  }, [rows, localLiked]);

  return useMemo<LikeStore>(() => ({
    liked: (id) => Boolean(rows[id]?.liked) || localLiked.has(id),
    likeCount: (id) => rows[id]?.total ?? 0,
    toggleLike,
  }), [rows, localLiked, toggleLike]);
};
