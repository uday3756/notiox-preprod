import { describe, expect, it } from "vitest";
import { APP_ROLE_OPTIONS, isAppRole, needsAppRole } from "./app-role";

describe("app-role", () => {
  it("accepts student and other only", () => {
    expect(isAppRole("student")).toBe(true);
    expect(isAppRole("other")).toBe(true);
    expect(isAppRole("founder")).toBe(false);
    expect(isAppRole(null)).toBe(false);
  });

  it("needs role when unset", () => {
    expect(needsAppRole(null)).toBe(true);
    expect(needsAppRole("student")).toBe(false);
    expect(needsAppRole("other")).toBe(false);
  });

  it("exposes student and other options", () => {
    expect(APP_ROLE_OPTIONS.map((o) => o.value)).toEqual(["student", "other"]);
  });
});
