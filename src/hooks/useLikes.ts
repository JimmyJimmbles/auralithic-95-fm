import { useCallback, useMemo, useState } from 'react';
import { readStringList, writeStorage } from '../lib/storage.ts';

export type LikeStore = {
  liked: (id: string) => boolean;
  likeCount: (id: string) => number;
  toggleLike: (id: string) => void;
};

export const useLikes = (): LikeStore => {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set(readStringList('likes')));

  const toggleLike = useCallback((id: string) => {
    setIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeStorage('likes', [...next]);
      return next;
    });
  }, []);

  return useMemo<LikeStore>(() => ({
    liked: (id) => ids.has(id),
    likeCount: (id) => (ids.has(id) ? 1 : 0),
    toggleLike,
  }), [ids, toggleLike]);
};
