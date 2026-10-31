import { reminderOwnerKey } from "./task-identity";

export function readOwnerStorage(base: string, userId: string | null | undefined): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(reminderOwnerKey(base, userId));
  } catch {
    return null;
  }
}

export function writeOwnerStorage(base: string, userId: string | null | undefined, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(reminderOwnerKey(base, userId), value);
  } catch {
    /* quota / private mode */
  }
}

export function clearOwnerStorage(base: string, userId: string | null | undefined): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(reminderOwnerKey(base, userId));
  } catch {
    /* ignore */
  }
}
