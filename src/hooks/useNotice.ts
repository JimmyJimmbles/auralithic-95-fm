import { useCallback, useEffect, useRef, useState } from 'react';

export const useNotice = () => {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((text: string) => {
    setMessage(text);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), 3200);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { message, show };
};
