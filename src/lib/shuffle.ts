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

const spacedIndices = (length: number, count: number, random: () => number): number[] => {
  if (count <= 0 || length <= 0) return [];
  if (count >= length) return Array.from({ length }, (_, index) => index);
  const buckets = length - count + 1;
  const base = Math.floor(count / buckets);
  const extra = count % buckets;
  const shift = Math.floor(random() * buckets);
  const extraAt = new Set<number>();
  for (let step = 0; step < extra; step += 1) {
    extraAt.add((Math.floor((step * buckets) / extra) + shift) % buckets);
  }
  const picks: number[] = [];
  let cursor = 0;
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const size = base + (extraAt.has(bucket) ? 1 : 0);
    for (let step = 0; step < size; step += 1) {
      picks.push(cursor);
      cursor += 1;
    }
    if (bucket < buckets - 1) cursor += 1;
  }
  return picks;
};

const placeByPhase = <T,>(groups: readonly Group<T>[], random: () => number): T[] => {
  const total = groups.reduce((sum, group) => sum + group.pile.length, 0);
  const placed: { at: number; tie: number; item: T }[] = [];
  groups.forEach((group, groupIndex) => {
    const count = group.pile.length;
    if (count === 0) return;
    const phase = (random() + groupIndex * 0.6180339887498949) % 1;
    group.pile.forEach((item, index) => {
      placed.push({
        at: ((index + phase) * total) / count,
        tie: random(),
        item,
      });
    });
  });
  placed.sort((left, right) => left.at - right.at || left.tie - right.tie);
  return placed.map((slot) => slot.item);
};

const placeMajority = <T,>(groups: readonly Group<T>[], random: () => number): T[] => {
  const total = groups.reduce((sum, group) => sum + group.pile.length, 0);
  const ordered = [...groups].sort((left, right) => right.pile.length - left.pile.length || left.key.localeCompare(right.key));
  const largest = ordered[0];
  if (!largest) return [];
  const slots: (T | undefined)[] = Array.from({ length: total }, () => undefined);
  const keys: (string | undefined)[] = Array.from({ length: total }, () => undefined);
  spacedIndices(total, largest.pile.length, random).forEach((slot, index) => {
    slots[slot] = largest.pile[index];
    keys[slot] = largest.key;
  });
  const rest = ordered.slice(1).map((group) => ({ key: group.key, pile: [...group.pile] }));
  for (let slot = 0; slot < total; slot += 1) {
    if (slots[slot] !== undefined) continue;
    const previous = slot > 0 ? keys[slot - 1] : undefined;
    let pool = rest.filter((group) => group.pile.length > 0);
    const others = previous ? pool.filter((group) => group.key !== previous) : pool;
    if (others.length > 0) pool = others;
    const most = Math.max(...pool.map((group) => group.pile.length));
    const tied = pool.filter((group) => group.pile.length === most);
    const pick = tied[Math.floor(random() * tied.length)];
    const item = pick?.pile.shift();
    if (!pick || item === undefined) continue;
    slots[slot] = item;
    keys[slot] = pick.key;
  }
  return slots.flatMap((item) => (item === undefined ? [] : [item]));
};

const placeEvenly = <T,>(groups: readonly Group<T>[], random: () => number): T[] => {
  const total = groups.reduce((sum, group) => sum + group.pile.length, 0);
  const largest = groups.reduce((max, group) => Math.max(max, group.pile.length), 0);
  if (largest * 2 > total) return placeMajority(groups, random);
  return placeByPhase(groups, random);
};

export const dealSpread = <T,>(
  items: readonly T[],
  groupOf: (item: T) => string,
  avoidStart?: (item: T) => boolean,
): T[] => {
  const random = mulberry32(hashString(items.map((item) => groupOf(item)).join('\0')));
  const piles = new Map<string, T[]>();
  for (const item of items) {
    const key = groupOf(item);
    const pile = piles.get(key);
    if (pile) pile.push(item);
    else piles.set(key, [item]);
  }
  const groups = [...piles.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([key, pile]) => ({ key, pile: shuffle(pile, random) }));
  const queue = placeEvenly(groups, random);
  const first = queue[0];
  if (avoidStart && first && queue.length > 1 && avoidStart(first)) {
    const later = queue.flatMap((item, index) => (index > 0 && !avoidStart(item) ? [index] : []));
    const swapAt = later[Math.floor(random() * later.length)];
    const swapped = swapAt === undefined ? undefined : queue[swapAt];
    if (swapAt !== undefined && swapped) {
      queue[0] = swapped;
      queue[swapAt] = first;
    }
  }
  return queue;
};
