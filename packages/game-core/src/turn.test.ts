import { describe, expect, it } from "vitest";
import { resolveTurnTokkas } from "./turn.js";

describe("resolveTurnTokkas", () => {
  it("no attempts scores nothing and does not die", () => {
    expect(resolveTurnTokkas([])).toEqual({ points: 0, died: false, tokkasCompleted: 0 });
  });

  it("two successful tokkas score 2 and survive", () => {
    const result = resolveTurnTokkas([{ success: true }, { success: true }]);
    expect(result).toEqual({ points: 2, died: false, tokkasCompleted: 2 });
  });

  it("a failed tokka after a success dies but keeps the earned point", () => {
    const result = resolveTurnTokkas([{ success: true }, { success: false }]);
    expect(result).toEqual({ points: 1, died: true, tokkasCompleted: 1 });
  });

  it("an immediate failed tokka dies with zero points", () => {
    const result = resolveTurnTokkas([{ success: false }]);
    expect(result).toEqual({ points: 0, died: true, tokkasCompleted: 0 });
  });

  it("stops processing attempts after the first failure", () => {
    const result = resolveTurnTokkas([{ success: false }, { success: true }]);
    expect(result).toEqual({ points: 0, died: true, tokkasCompleted: 0 });
  });
});
