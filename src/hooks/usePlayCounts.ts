import { useCallback, useState } from 'react';
import { readCountMap, writeStorage } from '../lib/storage.ts';

export const usePlayCounts = () => {
  const [counts, setCounts] = useState<Record<string, number>>(() => readCountMap('plays'));

  const recordPlay = useCallback((id: string) => {
    setCounts((current) => {
      const next = { ...current, [id]: (current[id] ?? 0) + 1 };
      writeStorage('plays', next);
      return next;
    });
  }, []);

  return { counts, recordPlay };
};
