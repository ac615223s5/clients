import { EFFLongWordList } from "@bitwarden/common/platform/misc/wordlist";

import { CommonEnglishWordList } from "./common-words";
import { cheapInsertMask, countTypos, isAdjacent, TYPO_MOVE_DISTANCE } from "./typo-count";

/** Bitwarden's passphrase words plus the most common English words and their forms. */
export const DefaultAutocorrectWordList: readonly string[] = [
  ...new Set([...EFFLongWordList, ...CommonEnglishWordList]),
];

export interface MasterPasswordAutocorrectOptions {
  /** Maximum number of corrected passwords to return. */
  maxCandidates?: number;
  /** Maximum total typos between a candidate and the typed password. */
  maxTotalTypos?: number;
  /** Maximum typos attributed to any single word. */
  maxWordTypos?: number;
  /** Partial word sequences kept per position during the search. */
  beamWidth?: number;
  /** Dictionary the passphrase words are drawn from. */
  wordlist?: readonly string[];
}

const MAX_TYPED_LENGTH = 128;
const MIN_WORDS = 2;
const NOT_ADJACENT_SUBSTITUTION = 3; // delete (1) + insert (2)

interface PartialPassphrase {
  words: string[];
  cost: number;
}

interface WordMatch {
  word: string;
  cost: number;
}

interface TrieNode {
  children: Map<string, TrieNode>;
  word?: string;
}

interface Dictionary {
  root: TrieNode;
  minLength: number;
  maxLength: number;
}

const dictionaryCache = new WeakMap<readonly string[], Dictionary>();

function buildDictionary(wordlist: readonly string[]): Dictionary {
  let dictionary = dictionaryCache.get(wordlist);
  if (!dictionary) {
    const root: TrieNode = { children: new Map() };
    let minLength = Infinity;
    let maxLength = 0;
    for (const word of wordlist) {
      const lower = word.toLowerCase();
      let node = root;
      for (const ch of lower) {
        let child = node.children.get(ch);
        if (!child) {
          child = { children: new Map() };
          node.children.set(ch, child);
        }
        node = child;
      }
      node.word = lower;
      minLength = Math.min(minLength, lower.length);
      maxLength = Math.max(maxLength, lower.length);
    }
    dictionary = { root, minLength, maxLength };
    dictionaryCache.set(wordlist, dictionary);
  }
  return dictionary;
}

/**
 * Finds every dictionary word within `limit` typos of `typed.slice(start, end)`, for
 * every `end` up to `maxEnd`, in a single trie walk. The per-word cost is a fast
 * approximation of `countTypos`: weighted Damerau-Levenshtein using the same costs,
 * with only adjacent transpositions as moves. Case-insensitive.
 *
 * Returns matches grouped by `end`.
 */
function matchWordsFrom(
  dictionary: Dictionary,
  typedLower: string,
  start: number,
  maxEnd: number,
  cheapIns: boolean[],
  limit: number,
): Map<number, WordMatch[]> {
  const cols = maxEnd - start + 1;
  const insertCost = (j: number) => (cheapIns[start + j - 1] ? 1 : 2);
  const results = new Map<number, WordMatch[]>();

  const firstRow: number[] = new Array(cols);
  firstRow[0] = 0;
  for (let j = 1; j < cols; j++) {
    firstRow[j] = firstRow[j - 1] + insertCost(j);
  }

  const visit = (
    node: TrieNode,
    r: string,
    prevR: string | undefined,
    prev: number[],
    prevPrev: number[] | undefined,
  ): void => {
    const row: number[] = new Array(cols);
    row[0] = prev[0] + 1;
    let rowMin = row[0];
    for (let j = 1; j < cols; j++) {
      const t = typedLower[start + j - 1];
      let best = Math.min(
        prev[j] + 1, // delete
        row[j - 1] + insertCost(j), // insert
        prev[j - 1] + (r === t ? 0 : isAdjacent(r, t) ? 1 : NOT_ADJACENT_SUBSTITUTION),
      );
      if (
        prevPrev &&
        j > 1 &&
        r === typedLower[start + j - 2] &&
        prevR === t &&
        prevPrev[j - 2] + 1 < best
      ) {
        best = prevPrev[j - 2] + 1; // swapped neighbours
      }
      row[j] = best;
      rowMin = Math.min(rowMin, best);
    }
    if (rowMin > limit) {
      return;
    }
    if (node.word) {
      for (let j = 1; j < cols; j++) {
        if (row[j] <= limit) {
          const matches = results.get(start + j) ?? [];
          matches.push({ word: node.word, cost: row[j] });
          results.set(start + j, matches);
        }
      }
    }
    for (const [ch, child] of node.children) {
      visit(child, ch, r, row, prev);
    }
  };

  for (const [ch, child] of dictionary.root.children) {
    visit(child, ch, undefined, firstRow, undefined);
  }
  return results;
}

/** Copies the capitalisation style of the typed segment onto a dictionary word. */
function matchCase(word: string, segment: string): string {
  if (
    segment.length > 1 &&
    segment === segment.toUpperCase() &&
    segment !== segment.toLowerCase()
  ) {
    return word.toUpperCase();
  }
  const first = segment[0];
  if (first !== first.toLowerCase()) {
    return word[0].toUpperCase() + word.slice(1);
  }
  return word;
}

/**
 * When `typed` looks like a mistyped passphrase (dictionary words separated by
 * spaces), returns up to `maxCandidates` nearby passphrases ordered from fewest to
 * most typos. Returns an empty list when nothing plausible is found.
 */
export function masterPasswordAutocorrectCandidates(
  typed: string,
  options: MasterPasswordAutocorrectOptions = {},
): string[] {
  const {
    maxCandidates = 5,
    maxTotalTypos = 4,
    maxWordTypos = 2,
    beamWidth = 20,
    wordlist = DefaultAutocorrectWordList,
  } = options;

  const n = typed.length;
  if (n < 3 || n > MAX_TYPED_LENGTH || maxCandidates <= 0 || wordlist.length === 0) {
    return [];
  }

  const dictionary = buildDictionary(wordlist);
  const typedLower = typed.toLowerCase();
  const cheapIns = cheapInsertMask(typed, TYPO_MOVE_DISTANCE);

  const startCache = new Map<number, Map<number, WordMatch[]>>();
  const matchesFrom = (start: number): Map<number, WordMatch[]> => {
    let byEnd = startCache.get(start);
    if (!byEnd) {
      const maxEnd = Math.min(n, start + dictionary.maxLength + maxWordTypos);
      byEnd = new Map();
      for (const [end, matches] of matchWordsFrom(
        dictionary,
        typedLower,
        start,
        maxEnd,
        cheapIns,
        maxWordTypos,
      )) {
        const segment = typed.slice(start, end);
        byEnd.set(
          end,
          matches
            .sort((a, b) => a.cost - b.cost)
            .slice(0, beamWidth)
            .map((m) => ({ word: matchCase(m.word, segment), cost: m.cost })),
        );
      }
      startCache.set(start, byEnd);
    }
    return byEnd;
  };

  // beams[pos]: best word sequences whose typed span ends exactly at `pos`.
  const beams: PartialPassphrase[][] = Array.from({ length: n + 1 }, (): PartialPassphrase[] => []);
  beams[0].push({ words: [], cost: 0 });

  for (let pos = 0; pos < n; pos++) {
    beams[pos] = pruneBeam(beams[pos], beamWidth);
    for (const partial of beams[pos]) {
      let start = pos;
      let separatorCost = 0;
      if (partial.words.length > 0) {
        if (typed[pos] === " ") {
          start = pos + 1;
        } else {
          separatorCost = 1; // missing space
        }
      }
      if (start >= n) {
        continue;
      }
      for (const [end, matches] of matchesFrom(start)) {
        for (const { word, cost } of matches) {
          const total = partial.cost + separatorCost + cost;
          if (total <= maxTotalTypos) {
            beams[end].push({ words: [...partial.words, word], cost: total });
          }
        }
      }
    }
  }

  const scored = new Map<string, number>();
  for (const { words } of pruneBeam(beams[n], beamWidth)) {
    if (words.length < MIN_WORDS) {
      continue;
    }
    const candidate = words.join(" ");
    if (candidate === typed || scored.has(candidate)) {
      continue;
    }
    const exact = countTypos(candidate, typed, TYPO_MOVE_DISTANCE, maxTotalTypos);
    if (exact <= maxTotalTypos) {
      scored.set(candidate, exact);
    }
  }

  return [...scored.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, maxCandidates)
    .map(([candidate]) => candidate);
}

function pruneBeam(beam: PartialPassphrase[], width: number): PartialPassphrase[] {
  const seen = new Set<string>();
  return [...beam]
    .sort((a, b) => a.cost - b.cost)
    .filter((p) => {
      const key = p.words.join(" ");
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, width);
}
