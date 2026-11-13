import type { LiveCut } from '../db/schema.js';

type Group<T> = { key: string; pile: T[] };

const hashString = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffle = <T,>(items: readonly T[], random: () => number): T[] => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const current = result[index];
    const other = result[swap];
    if (current === undefined || other === undefined) continue;
    result[index] = other;
    result[swap] = current;
  }
  return result;
};

export const orderCycle = (items: readonly LiveCut[], seed: string, cycle: number, avoidId?: string): LiveCut[] => {
  const random = mulberry32(hashString(`${seed}:${cycle}`));
  const piles = new Map<string, LiveCut[]>();
  for (const item of items) {
    const pile = piles.get(item.group);
    if (pile) pile.push(item);
    else piles.set(item.group, [item]);
  }
  const groups: Group<LiveCut>[] = [...piles.entries()].map(([key, pile]) => ({ key, pile: shuffle(pile, random) }));
  const queue: LiveCut[] = [];
  let previous: string | null = null;
  while (groups.some((group) => group.pile.length > 0)) {
    const remaining: Group<LiveCut>[] = groups.filter((group) => group.pile.length > 0);
    const others: Group<LiveCut>[] = previous ? remaining.filter((group) => group.key !== previous) : remaining;
    const pool: Group<LiveCut>[] = others.length > 0 ? others : remaining;
    const most = Math.max(...pool.map((group) => group.pile.length));
    const candidates: Group<LiveCut>[] = pool.filter((group) => group.pile.length === most);
    const chosen: Group<LiveCut> | undefined = candidates[Math.floor(random() * candidates.length)];
    const next = chosen?.pile.shift();
    if (!chosen || !next) break;
    queue.push(next);
    previous = chosen.key;
  }
  const first = queue[0];
  if (avoidId && first && queue.length > 1 && first.id === avoidId) {
    const later = queue.flatMap((item, index) => (index > 0 && item.id !== avoidId ? [index] : []));
    const swapAt = later[Math.floor(random() * later.length)];
    const swapped = swapAt === undefined ? undefined : queue[swapAt];
    if (swapAt !== undefined && swapped) {
      queue[0] = swapped;
      queue[swapAt] = first;
    }
  }
  return queue;
};
