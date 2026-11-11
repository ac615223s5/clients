import { countTypos } from "./typo-count";

describe("countTypos", () => {
  it.each([
    ["hello", "hello", 0],
    ["hello", "hlelo", 1], // move 'e' (or 'l') by 1
    ["hello", "helo", 1], // missing char
    ["cat", "cst", 1], // a -> s adjacent
    ["cat", "ct", 1], // missing char
    ["cat", "cpt", 3], // non-adjacent sub = delete(1) + insert(2)
    ["cat", "caat", 1], // extra 'a' next to 'a': cheap insert
    ["cat", "cart", 1], // extra 'r' next to 't': cheap insert
    ["cat", "capt", 2], // 'p' not near c/a/t: arbitrary insert
    ["dog", "dpog", 1], // 'p' adjacent to 'o': cheap insert
    ["the", "teh", 1],
    ["abcdef", "bcdaef", 1], // 'a' moved 3 -> allowed
    ["abcdef", "bcdeaf", 3], // 'a' moved 4 -> not a move
    ["abcdef", "dabcef", 1], // 'd' moved back 3
    ["abcd", "badc", 2], // two independent moves
  ])("%s -> %s = %i", (reference, typed, expected) => {
    expect(countTypos(reference, typed)).toBe(expected);
  });

  it("returns Infinity when the cost exceeds maxCost", () => {
    expect(countTypos("cat", "cpt", 3, 2)).toBe(Infinity);
  });
});
