import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

type WebKitDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type WebKitElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

const fullscreenElement = (): Element | null =>
  document.fullscreenElement ?? (document as WebKitDocument).webkitFullscreenElement ?? null;

export const useFullscreen = (notify: (message: string) => void) => {
  const [native, setNative] = useState(false);
  const [fallback, setFallback] = useState(false);
  const pending = useRef(false);
  const notifyRef = useRef(notify);
  useLayoutEffect(() => {
    notifyRef.current = notify;
  });

  useEffect(() => {
    const sync = () => setNative(Boolean(fullscreenElement()));
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    sync();
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  const toggle = useCallback(async () => {
    if (pending.current) return;
    if (fallback) {
      setFallback(false);
      return;
    }
    pending.current = true;
    try {
      if (fullscreenElement()) {
        const doc = document as WebKitDocument;
        const exit = document.exitFullscreen?.bind(document) ?? doc.webkitExitFullscreen?.bind(doc);
        if (!exit) throw new Error('Fullscreen unavailable');
        await exit();
      } else {
        const root = document.documentElement as WebKitElement;
        const enter = root.requestFullscreen?.bind(root) ?? root.webkitRequestFullscreen?.bind(root);
        if (!enter) throw new Error('Fullscreen unavailable');
        await enter();
      }
    } catch {
      if (!fullscreenElement()) {
        setFallback(true);
        notifyRef.current('Desktop expanded. This browser is keeping its controls visible.');
      } else {
        notifyRef.current('Press Escape to exit full screen.');
      }
    } finally {
      pending.current = false;
    }
  }, [fallback]);

  const exitFallback = useCallback(() => setFallback(false), []);

  return { expanded: native || fallback, fallback, toggle, exitFallback };
};
