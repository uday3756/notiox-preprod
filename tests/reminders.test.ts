import { describe, expect, it } from "vitest";
import { reminderCopyKind, reminderOwnerKey, shouldBrowserNotifyTask } from "../src/lib/task-identity";

describe("reminder authority", () => {
  it("scopes local history by owner", () => {
    expect(reminderOwnerKey("Notio.notified-tasks", "user-a")).not.toBe(
      reminderOwnerKey("Notio.notified-tasks", "user-b"),
    );
  });

  it("keeps Canvas tasks off the browser poller", () => {
    expect(shouldBrowserNotifyTask("canvas")).toBe(false);
    expect(shouldBrowserNotifyTask("voice")).toBe(true);
  });

  it("uses due copy for Canvas deadlines and starts for planned work", () => {
    expect(reminderCopyKind({ source: "canvas", dueAt: "2026-11-02T09:00:00+05:30" })).toBe("due");
    expect(reminderCopyKind({ source: "voice", startTime: "2026-11-02T09:00:00+05:30" })).toBe("starts");
  });
});
