import { useEffect, useRef } from 'react';
import { coverUrl } from '../data/catalog.ts';

const samplePalettes: Record<string, [string, string]> = {
  eclipse: ['#b54b38', '#f6a08a'],
  bloom: ['#7863a0', '#ceb3ed'],
  chrome: ['#286992', '#a0d8fb'],
  fern: ['#648358', '#b9d6a9'],
  redroom: ['#9b333e', '#ff9a9c'],
  mirror: ['#524c9d', '#b9aefa'],
};

const palettes = new Map<string, Promise<[string, string]>>();

const fallback = (name: string): [string, string] => samplePalettes[name] ?? samplePalettes.bloom ?? ['#7863a0', '#ceb3ed'];

const colorsFromCover = (name: string): Promise<[string, string]> => {
  const cached = palettes.get(name);
  if (cached) return cached;
  const result = new Promise<[string, string]>((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 36;
        canvas.height = 36;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
          resolve(fallback(name));
          return;
        }
        context.drawImage(image, 0, 0, 36, 36);
        const pixels = context.getImageData(0, 0, 36, 36).data;
        const bins: [number, number, number][] = Array.from({ length: 24 }, () => [0, 0, 0]);
        for (let offset = 0; offset < pixels.length; offset += 4) {
          const red = (pixels[offset] ?? 0) / 255;
          const green = (pixels[offset + 1] ?? 0) / 255;
          const blue = (pixels[offset + 2] ?? 0) / 255;
          const max = Math.max(red, green, blue);
          const min = Math.min(red, green, blue);
          const chroma = max - min;
          if (chroma < 0.12 || max < 0.24) continue;
          let hue = max === red ? (green - blue) / chroma : max === green ? (blue - red) / chroma + 2 : (red - green) / chroma + 4;
          hue = (hue * 60 + 360) % 360;
          const weight = chroma * max;
          const bin = bins[Math.floor(hue / 15)];
          if (!bin) continue;
          bin[0] += weight;
          bin[1] += Math.cos((hue * Math.PI) / 180) * weight;
          bin[2] += Math.sin((hue * Math.PI) / 180) * weight;
        }
        const best = bins.reduce((winner, bin) => (bin[0] > winner[0] ? bin : winner));
        if (!best[0]) {
          resolve(fallback(name));
          return;
        }
        const hue = (Math.atan2(best[2], best[1]) * 180 / Math.PI + 360) % 360;
        resolve([`hsl(${hue} 53% 42%)`, `hsl(${hue} 76% 77%)`]);
      } catch {
        resolve(fallback(name));
      }
    };
    image.onerror = () => resolve(fallback(name));
    image.src = coverUrl(name);
  });
  palettes.set(name, result);
  return result;
};

export const usePalette = (art: string | undefined): void => {
  const request = useRef(0);
  useEffect(() => {
    if (!art) return;
    const token = ++request.current;
    void colorsFromCover(art).then((colors) => {
      // A fast skip can resolve an older cover after a newer one was requested.
      if (token !== request.current) return;
      document.body.style.setProperty('--ink-tint', colors[0]);
      document.body.style.setProperty('--accent', colors[1]);
    });
  }, [art]);
};
