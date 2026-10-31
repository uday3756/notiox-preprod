import { describe, expect, it } from "vitest";
import { canvasMcpConfigured } from "../src/lib/canvas-mcp.server";

describe("canvas MCP", () => {
  it("is off without env", () => {
    expect(canvasMcpConfigured()).toBe(false);
  });
});
