import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

type Drag = { pointerId: number; offsetX: number; offsetY: number };

export const useWindowDrag = (windowRef: RefObject<HTMLElement | null>) => {
  const position = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef<Drag | null>(null);

  const move = useCallback((x: number, y: number) => {
    const program = windowRef.current;
    const desktop = program?.parentElement;
    if (!program || !desktop) return;
    const maxX = Math.max(0, desktop.clientWidth - program.offsetWidth);
    const maxY = Math.max(0, desktop.clientHeight - program.offsetHeight);
    const next = {
      x: Math.min(maxX, Math.max(0, x)),
      y: Math.min(maxY, Math.max(0, y)),
    };
    position.current = next;
    // Translate from the centered layout slot so a tall artist page can still scroll.
    program.style.transform = `translate(${next.x - program.offsetLeft}px, ${next.y - program.offsetTop}px)`;
  }, [windowRef]);

  useEffect(() => {
    const program = windowRef.current;
    const desktop = program?.parentElement;
    if (!program || !desktop) return;
    const observer = new ResizeObserver(() => {
      if (position.current && !program.hidden) move(position.current.x, position.current.y);
    });
    observer.observe(desktop);
    observer.observe(program);
    return () => observer.disconnect();
  }, [move, windowRef]);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest('button')) return;
    const program = windowRef.current;
    if (!program) return;
    const bounds = program.getBoundingClientRect();
    drag.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    const program = windowRef.current;
    const desktop = program?.parentElement;
    if (!desktop) return;
    const bounds = desktop.getBoundingClientRect();
    move(event.clientX - bounds.left - drag.current.offsetX, event.clientY - bounds.top - drag.current.offsetY);
  };

  const onLostPointerCapture = (event: ReactPointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  };

  return { onPointerDown, onPointerMove, onLostPointerCapture };
};
