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
