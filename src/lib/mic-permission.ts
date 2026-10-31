/**
 * Explicit mic permission preflight (plan: store Capture UX).
 * Triggers the OS prompt before recording starts.
 */
export async function ensureMicrophonePermission(): Promise<
  "granted" | "denied" | "unsupported"
> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return "unsupported";
  }

  // Permissions API when available (Chrome/Android).
  try {
    const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
    if (perms?.query) {
      const status = await perms.query({ name: "microphone" as PermissionName });
      if (status.state === "granted") return "granted";
      if (status.state === "denied") return "denied";
    }
  } catch {
    /* Safari / older WebViews may not support microphone permission query */
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const t of stream.getTracks()) t.stop();
    return "granted";
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") return "denied";
    return "denied";
  }
}
