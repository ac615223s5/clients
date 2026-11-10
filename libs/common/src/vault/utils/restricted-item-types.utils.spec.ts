import { CipherType } from "../enums";

import { getRestrictedItemTypes } from "./restricted-item-types.utils";

describe("getRestrictedItemTypes", () => {
  it.each([null, undefined])("defaults %s to [Card]", (data) => {
    expect(getRestrictedItemTypes(data)).toEqual([CipherType.Card]);
  });

  it("reads the restrictedTypes object shape", () => {
    expect(
      getRestrictedItemTypes({ restrictedTypes: [CipherType.Card, CipherType.BankAccount] }),
    ).toEqual([CipherType.Card, CipherType.BankAccount]);
  });

  it("treats an empty restrictedTypes list as nothing restricted", () => {
    expect(getRestrictedItemTypes({ restrictedTypes: [] })).toEqual([]);
  });

  it("reads a legacy bare array", () => {
    expect(getRestrictedItemTypes([CipherType.Card, CipherType.Login])).toEqual([
      CipherType.Card,
      CipherType.Login,
    ]);
  });

  it("treats an empty legacy array as nothing restricted", () => {
    expect(getRestrictedItemTypes([])).toEqual([]);
  });

  it("drops unknown values and duplicates", () => {
    expect(
      getRestrictedItemTypes({
        restrictedTypes: [CipherType.Card, 99, "3", null, CipherType.Card, CipherType.Passport],
      }),
    ).toEqual([CipherType.Card, CipherType.Passport]);
  });

  it.each([
    ["an empty object", {}],
    ["restrictedTypes that is not an array", { restrictedTypes: 3 }],
    ["a string", "card"],
    ["a number", 3],
    ["a boolean", true],
  ])("falls back to [Card] for %s", (_, data) => {
    expect(getRestrictedItemTypes(data)).toEqual([CipherType.Card]);
  });

  it("returns a new array each time", () => {
    const first = getRestrictedItemTypes(null);
    first.push(CipherType.Identity);

    expect(getRestrictedItemTypes(null)).toEqual([CipherType.Card]);
  });
});
