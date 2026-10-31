import { Capacitor, registerPlugin } from "@capacitor/core";
import type { Session } from "@supabase/supabase-js";
import { FEATURE_FLAGS } from "./feature-flags";

type WidgetOptions = { privateTitles: boolean; assignment: string };
const widget = registerPlugin<{
  configure(input: WidgetOptions & { accountId: string; accessToken: string }): Promise<void>;
  clear(): Promise<void>;
  pause(input: { accountId: string }): Promise<void>;
}>("NotioWidget");
export function supportsNativeWidget() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}
export function widgetOptions(userId: string): WidgetOptions {
  try {
    const stored = JSON.parse(localStorage.getItem(`notio:widget:${userId}`) ?? "null");
    return {
      privateTitles: stored?.privateTitles === true,
      assignment: typeof stored?.assignment === "string" ? stored.assignment : "",
    };
  } catch {
    return { privateTitles: false, assignment: "" };
  }
}
export async function configureNativeWidget(
  session: Session,
  options = widgetOptions(session.user.id),
) {
  if (!FEATURE_FLAGS.workflow || !FEATURE_FLAGS.nativeWidgets || !supportsNativeWidget()) return;
  await widget.configure({
    ...options,
    accountId: session.user.id,
    accessToken: session.access_token,
  });
  localStorage.setItem(`notio:widget:${session.user.id}`, JSON.stringify(options));
}
export async function clearNativeWidget() {
  if (supportsNativeWidget()) await widget.clear();
}
export async function pauseNativeWidget(accountId: string) {
  if (supportsNativeWidget()) await widget.pause({ accountId });
}
