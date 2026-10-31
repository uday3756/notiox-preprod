import { describe, expect, it } from "vitest";
import { levelForXp, dolphinAssetFor } from "../src/lib/dolphin-progression";

describe("dolphin", () => {
  it("uses GIF for listening/thinking/calm", () => {
    expect(dolphinAssetFor("listening")).toContain(".gif");
    expect(dolphinAssetFor("thinking")).toContain(".gif");
    expect(dolphinAssetFor("calm")).toContain(".gif");
  });
  it("levels at 100 XP", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(100)).toBe(2);
  });
});
