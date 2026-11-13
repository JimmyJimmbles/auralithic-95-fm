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

export type StationSession = {
  scope: string;
  trackId: string | null;
  position: number;
};

const stationCookie = 'auralithic_station';

const cookieDomain = (): string => {
  const host = window.location.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return '; Domain=localhost';
  if (host === 'auralithic.fm' || host.endsWith('.auralithic.fm')) return '; Domain=.auralithic.fm';
  return '';
};

export const readStationSession = (): StationSession | null => {
  const raw = document.cookie.split('; ').find((row) => row.startsWith(`${stationCookie}=`));
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(decodeURIComponent(raw.slice(stationCookie.length + 1)));
    if (!value || typeof value !== 'object') return null;
    const session = value as Partial<StationSession>;
    if (typeof session.scope !== 'string' || !session.scope) return null;
    return {
      scope: session.scope,
      trackId: typeof session.trackId === 'string' ? session.trackId : null,
      position: typeof session.position === 'number' && Number.isFinite(session.position) ? session.position : 0,
    };
  } catch {
    return null;
  }
};

export const writeStationSession = (scope: string, trackId: string | null, position: number): void => {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  const payload = encodeURIComponent(JSON.stringify({ scope, trackId, position }));
  document.cookie = `${stationCookie}=${payload}; Path=/; Max-Age=2592000; SameSite=Lax${cookieDomain()}${secure}`;
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
