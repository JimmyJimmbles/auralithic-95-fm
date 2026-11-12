const prefix = 'auralithic:';

export const readStorage = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(prefix + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const writeStorage = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(prefix + key, JSON.stringify(value));
  } catch {
    // Private mode and some file origins reject storage writes.
  }
};

export const readNumber = (key: string, fallback: number): number => {
  const value = readStorage<unknown>(key, fallback);
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

export const readBoolean = (key: string, fallback: boolean): boolean => {
  const value = readStorage<unknown>(key, fallback);
  return typeof value === 'boolean' ? value : fallback;
};

export const readStringList = (key: string): string[] => {
  const value = readStorage<unknown>(key, []);
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
};

export const readCountMap = (key: string): Record<string, number> => {
  const value = readStorage<unknown>(key, {});
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const counts: Record<string, number> = {};
  for (const [id, count] of Object.entries(value)) {
    if (typeof count === 'number' && Number.isFinite(count)) counts[id] = count;
  }
  return counts;
};
