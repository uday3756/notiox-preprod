const DB = "notiox-offline-v1";

function ownerKey(userId: string) {
  return `owner:${userId}`;
}

export async function queueDraft(userId: string, draft: unknown) {
  try {
    sessionStorage.setItem(`${DB}:${ownerKey(userId)}:draft`, JSON.stringify(draft));
  } catch {
    /* storage unavailable */
  }
}

export function readQueuedDraft(userId: string): unknown | null {
  try {
    const raw = sessionStorage.getItem(`${DB}:${ownerKey(userId)}:draft`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearQueuedDraft(userId: string) {
  try {
    sessionStorage.removeItem(`${DB}:${ownerKey(userId)}:draft`);
  } catch {
    /* ignore */
  }
}
