type Group<T> = { key: string; pile: T[] };

const shuffle = <T,>(items: readonly T[]): T[] => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const current = result[index];
    const other = result[swap];
    if (current === undefined || other === undefined) continue;
    result[index] = other;
    result[swap] = current;
  }
  return result;
};

// Shuffle inside each group, then deal from a fullest group that is not the one
// just used while any other group still has tracks. Ties break at random.
export const dealSpread = <T,>(
  items: readonly T[],
  groupOf: (item: T) => string,
  avoidStart?: (item: T) => boolean,
): T[] => {
  const piles = new Map<string, T[]>();
  for (const item of items) {
    const key = groupOf(item);
    const pile = piles.get(key);
    if (pile) pile.push(item);
    else piles.set(key, [item]);
  }

  const groups: Group<T>[] = [...piles.entries()].map(([key, pile]) => ({ key, pile: shuffle(pile) }));
  const queue: T[] = [];
  let previous: string | null = null;

  while (groups.some((group) => group.pile.length > 0)) {
    const remaining: Group<T>[] = groups.filter((group) => group.pile.length > 0);
    const last = previous;
    const others: Group<T>[] = last ? remaining.filter((group) => group.key !== last) : remaining;
    const pool: Group<T>[] = others.length > 0 ? others : remaining;
    const most = Math.max(...pool.map((group) => group.pile.length));
    const candidates: Group<T>[] = pool.filter((group) => group.pile.length === most);
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    const next = chosen?.pile.shift();
    if (!chosen || !next) break;
    queue.push(next);
    previous = chosen.key;
  }

  const first = queue[0];
  if (avoidStart && first && queue.length > 1 && avoidStart(first)) {
    const later = queue.flatMap((item, index) => (index > 0 && !avoidStart(item) ? [index] : []));
    const swapAt = later[Math.floor(Math.random() * later.length)];
    const swapped = swapAt === undefined ? undefined : queue[swapAt];
    if (swapAt !== undefined && swapped) {
      queue[0] = swapped;
      queue[swapAt] = first;
    }
  }

  return queue;
};
