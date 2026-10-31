import { describe, expect, it } from "vitest";
import { decryptCanvasToken, encryptCanvasToken } from "./canvas-crypto.server";

describe("canvas token crypto", () => {
  it("round-trips a student token", () => {
    const token = "canvas-test-token-12345";
    const enc = encryptCanvasToken(token);
    expect(enc).not.toContain(token);
    expect(decryptCanvasToken(enc)).toBe(token);
  });
});
