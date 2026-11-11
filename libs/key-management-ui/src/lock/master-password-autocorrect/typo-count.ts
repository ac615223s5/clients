/**
 * Counts the minimum number of typos that turn `reference` into `typed`.
 *
 * Typo operations (reference -> typed), with costs:
 *   match            exact same character                                    0
 *   substitute       replace a char with a keyboard-adjacent key (~6)        1
 *   delete           a ref char is missing from typed                        1
 *   insert (cheap)   extra char in typed that is equal or keyboard-adjacent  1
 *                    to another typed char within K positions
 *   insert           any other extra char in typed                           2
 *   move             a ref char shifts by up to K positions                  1
 *                    (each char may be moved at most once, and a moved char
 *                    must arrive unchanged)
 *
 * Shortest path (Dijkstra) over alignment states (i, j, lifted, ahead):
 *   i       next reference index to consume
 *   j       next typed index to produce
 *   lifted  ref chars taken out early, waiting to be placed later in typed
 *           (forward moves), stored as [char, originIndex]
 *   ahead   typed chars emitted early, waiting for their ref char to come up
 *           (backward moves), stored as [char, cursorWhenEmitted]
 */

export const TYPO_MOVE_DISTANCE = 3;

// QWERTY with standard stagger: up to 6 neighbours per key.
const ROWS = ["1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm"];

const ADJACENCY: ReadonlyMap<string, ReadonlySet<string>> = (() => {
  const adjacency = new Map<string, Set<string>>();
  ROWS.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      const neighbours = new Set<string>();
      const offsets = [
        [r, c - 1],
        [r, c + 1],
        [r - 1, c],
        [r - 1, c + 1],
        [r + 1, c - 1],
        [r + 1, c],
      ];
      for (const [rr, cc] of offsets) {
        if (rr >= 0 && rr < ROWS.length && cc >= 0 && cc < ROWS[rr].length) {
          neighbours.add(ROWS[rr][cc]);
        }
      }
      adjacency.set(ch, neighbours);
    });
  });
  return adjacency;
})();

export function isAdjacent(a: string, b: string): boolean {
  return ADJACENCY.get(a.toLowerCase())?.has(b.toLowerCase()) ?? false;
}

function isNear(a: string, b: string): boolean {
  return a === b || isAdjacent(a, b);
}

/**
 * For each typed index, whether an extra char there counts as a cheap insert
 * (equal or adjacent to another typed char within `k` positions).
 */
export function cheapInsertMask(typed: string, k = TYPO_MOVE_DISTANCE): boolean[] {
  const mask: boolean[] = [];
  for (let j = 0; j < typed.length; j++) {
    let cheap = false;
    for (let x = Math.max(0, j - k); x < Math.min(typed.length, j + k + 1) && !cheap; x++) {
      cheap = x !== j && isNear(typed[j], typed[x]);
    }
    mask.push(cheap);
  }
  return mask;
}

type Pending = readonly (readonly [string, number])[];

interface State {
  i: number;
  j: number;
  lifted: Pending;
  ahead: Pending;
}

function comparePending(a: readonly [string, number], b: readonly [string, number]): number {
  if (a[0] !== b[0]) {
    return a[0] < b[0] ? -1 : 1;
  }
  return a[1] - b[1];
}

function withAdded(list: Pending, entry: readonly [string, number]): Pending {
  return [...list, entry].sort(comparePending);
}

function without(list: Pending, idx: number): Pending {
  return [...list.slice(0, idx), ...list.slice(idx + 1)];
}

function stateKey(s: State): string {
  return JSON.stringify([s.i, s.j, s.lifted, s.ahead]);
}

class MinHeap<T> {
  private readonly items: { priority: number; value: T }[] = [];

  get size(): number {
    return this.items.length;
  }

  push(priority: number, value: T): void {
    const items = this.items;
    items.push({ priority, value });
    let n = items.length - 1;
    while (n > 0) {
      const parent = (n - 1) >> 1;
      if (items[parent].priority <= items[n].priority) {
        break;
      }
      [items[parent], items[n]] = [items[n], items[parent]];
      n = parent;
    }
  }

  pop(): { priority: number; value: T } {
    const items = this.items;
    const top = items[0];
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let n = 0;
      for (;;) {
        const l = 2 * n + 1;
        const r = l + 1;
        let smallest = n;
        if (l < items.length && items[l].priority < items[smallest].priority) {
          smallest = l;
        }
        if (r < items.length && items[r].priority < items[smallest].priority) {
          smallest = r;
        }
        if (smallest === n) {
          break;
        }
        [items[smallest], items[n]] = [items[n], items[smallest]];
        n = smallest;
      }
    }
    return top;
  }
}

/**
 * Returns the minimum typo count turning `reference` into `typed`, or `Infinity`
 * if it exceeds `maxCost`.
 */
export function countTypos(
  reference: string,
  typed: string,
  k = TYPO_MOVE_DISTANCE,
  maxCost = Infinity,
): number {
  const n = reference.length;
  const m = typed.length;
  const cheapIns = cheapInsertMask(typed, k);

  const valid = (s: State): boolean =>
    s.lifted.every(([, o]) => s.i - 1 - o <= k) && s.ahead.every(([, p]) => s.i - p <= k);

  function* successors(s: State): Generator<[number, State]> {
    const { i, j, lifted, ahead } = s;
    if (i < n) {
      const r = reference[i];
      if (j < m) {
        const t = typed[j];
        if (r === t) {
          yield [0, { i: i + 1, j: j + 1, lifted, ahead }];
        } else if (isAdjacent(r, t)) {
          yield [1, { i: i + 1, j: j + 1, lifted, ahead }];
        }
      }
      // delete ref[i]
      yield [1, { i: i + 1, j, lifted, ahead }];
      // forward move: lift ref[i], place it later
      yield [1, { i: i + 1, j, lifted: withAdded(lifted, [r, i]), ahead }];
      // resolve a backward move: ref[i] was already emitted earlier
      for (let idx = 0; idx < ahead.length; idx++) {
        const [c, p] = ahead[idx];
        if (c === r && i - p >= 1) {
          yield [0, { i: i + 1, j, lifted, ahead: without(ahead, idx) }];
        }
      }
    }
    if (j < m) {
      const t = typed[j];
      yield [cheapIns[j] ? 1 : 2, { i, j: j + 1, lifted, ahead }];
      // place a lifted (forward-moved) char here
      for (let idx = 0; idx < lifted.length; idx++) {
        const [c, o] = lifted[idx];
        if (c === t && i - 1 - o >= 1) {
          yield [0, { i, j: j + 1, lifted: without(lifted, idx), ahead }];
        }
      }
      // backward move: emit typed[j] now, match a later ref char
      yield [1, { i, j: j + 1, lifted, ahead: withAdded(ahead, [t, i]) }];
    }
  }

  const start: State = { i: 0, j: 0, lifted: [], ahead: [] };
  const goalKey = stateKey({ i: n, j: m, lifted: [], ahead: [] });
  const dist = new Map<string, number>([[stateKey(start), 0]]);
  const heap = new MinHeap<State>();
  heap.push(0, start);

  while (heap.size > 0) {
    const { priority: d, value: s } = heap.pop();
    if (d > maxCost) {
      return Infinity;
    }
    const key = stateKey(s);
    if (d > (dist.get(key) ?? Infinity)) {
      continue;
    }
    if (key === goalKey) {
      return d;
    }
    for (const [cost, ns] of successors(s)) {
      if (!valid(ns)) {
        continue;
      }
      const nd = d + cost;
      const nk = stateKey(ns);
      if (nd < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nd);
        heap.push(nd, ns);
      }
    }
  }
  return Infinity;
}
