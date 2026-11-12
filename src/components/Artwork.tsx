import { useEffect, useState } from 'react';
import { coverUrl } from '../data/catalog.ts';

type Layer = { key: number; src: string; arriving: boolean };

let layerKey = 0;

export const Artwork = ({ art, alt, fadeMs }: { art: string; alt: string; fadeMs: number }) => {
  const [layers, setLayers] = useState<Layer[]>([]);

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const key = ++layerKey;
      setLayers((current) => {
        const previous = current.length > 0 ? current[current.length - 1] : undefined;
        const base = previous ? [{ ...previous, arriving: false }] : [];
        return [...base, { key, src: coverUrl(art), arriving: true }];
      });
    };
    image.src = coverUrl(art);
    return () => {
      cancelled = true;
    };
  }, [art]);

  useEffect(() => {
    if (layers.length < 2) return;
    const timer = window.setTimeout(() => {
      setLayers((current) => (current.length > 1 ? current.slice(-1) : current));
    }, fadeMs);
    return () => window.clearTimeout(timer);
  }, [fadeMs, layers]);

  return (
    <>
      {layers.map((layer) => (
        <img key={layer.key} className={layer.arriving ? 'arriving' : undefined} src={layer.src} alt={layer.arriving ? alt : ''} />
      ))}
    </>
  );
};
