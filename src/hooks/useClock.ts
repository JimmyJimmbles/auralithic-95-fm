import { useEffect, useMemo, useState } from 'react';

export const useClock = (): { label: string; dateTime: string } => {
  const format = useMemo(
    () => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }),
    [],
  );
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  return { label: format.format(now), dateTime: now.toISOString() };
};
