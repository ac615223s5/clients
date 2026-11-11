import { masterPasswordAutocorrectCandidates } from "./master-password-autocorrect";

describe("masterPasswordAutocorrectCandidates", () => {
  it("corrects an adjacent-key substitution in a passphrase", () => {
    expect(masterPasswordAutocorrectCandidates("correct staple batrery")).toContain(
      "correct staple battery",
    );
  });

  it("corrects a missing space and a swapped pair", () => {
    expect(masterPasswordAutocorrectCandidates("correctstaple battery")).toContain(
      "correct staple battery",
    );
    expect(masterPasswordAutocorrectCandidates("corretc staple battery")).toContain(
      "correct staple battery",
    );
  });

  it("keeps the capitalisation of each typed word", () => {
    expect(masterPasswordAutocorrectCandidates("Correct Staple Batteru")).toContain(
      "Correct Staple Battery",
    );
  });

  it("returns at most five candidates, never the typed password itself", () => {
    const typed = "correct staple battery";
    const candidates = masterPasswordAutocorrectCandidates(typed);
    expect(candidates.length).toBeLessThanOrEqual(5);
    expect(candidates).not.toContain(typed);
  });

  it("returns nothing for passwords that are not near a word sequence", () => {
    expect(masterPasswordAutocorrectCandidates("x7#Qp!2zLm9$")).toEqual([]);
    expect(masterPasswordAutocorrectCandidates("")).toEqual([]);
  });
});

describe("masterPasswordAutocorrectCandidates with common English words", () => {
  it("corrects words that are only in the common-words list, including inflected forms", () => {
    expect(masterPasswordAutocorrectCandidates("correct hirse battery")).toContain(
      "correct horse battery",
    );
    expect(masterPasswordAutocorrectCandidates("she wnet running")).toContain("she went running");
  });
});

describe("masterPasswordAutocorrectCandidates with a mistimed space", () => {
  it.each([
    // Space too early: a word's last character moves to the start of the next word.
    ["correc thorse battery", "correct horse battery"],
    ["the quic kbrown fox", "the quick brown fox"],
    ["i love m ydog", "i love my dog"],
    // Space too late: a word's first character moves to the end of the previous word.
    ["correcth orse battery", "correct horse battery"],
    ["the quickb rown fox", "the quick brown fox"],
    ["i lovem y dog", "i love my dog"],
    // Both sides of one word, and combined with another typo or capitals.
    ["correc thorseb attery", "correct horse battery"],
    ["the quic kbrownf ox", "the quick brown fox"],
    ["correc thorse batrery", "correct horse battery"],
    ["Correc tHorse Battery", "Correct Horse Battery"],
  ])("ranks the intended passphrase first for %s", (typed, intended) => {
    expect(masterPasswordAutocorrectCandidates(typed)[0]).toBe(intended);
  });
});
