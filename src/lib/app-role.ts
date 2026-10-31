import type { SupabaseClient, User } from "@supabase/supabase-js";

/** Product roles for Canvas gating — same Notiolive.com app, no separate domain. */
export type AppRole = "student" | "other";

export const APP_ROLE_OPTIONS: { value: AppRole; label: string; hint: string }[] = [
  {
    value: "student",
    label: "Student",
    hint: "Connect your school Canvas to import courses and assignments.",
  },
  {
    value: "other",
    label: "Other",
    hint: "Founders, freelancers, and everyone else. You can switch later in Profile.",
  },
];

export function isAppRole(value: unknown): value is AppRole {
  return value === "student" || value === "other";
}

export function appRoleFromUser(user: User | null | undefined): AppRole | null {
  const meta = user?.user_metadata?.notio_app_role;
  return isAppRole(meta) ? meta : null;
}

/**
 * Resolve role from profiles.app_role, then auth metadata fallback.
 */
export async function readAppRole(
  client: SupabaseClient,
  user: User,
): Promise<AppRole | null> {
  const { data } = await client
    .from("profiles")
    .select("app_role")
    .eq("id", user.id)
    .maybeSingle();
  if (isAppRole(data?.app_role)) return data.app_role;
  return appRoleFromUser(user);
}

/**
 * Persist app role on profiles + auth metadata (metadata works even before migration).
 */
export async function writeAppRole(
  client: SupabaseClient,
  userId: string,
  role: AppRole,
): Promise<{ error: string | null }> {
  const { error: metaErr } = await client.auth.updateUser({
    data: { notio_app_role: role },
  });
  if (metaErr) return { error: metaErr.message };

  const { error: profileErr } = await client
    .from("profiles")
    .update({ app_role: role, updated_at: new Date().toISOString() })
    .eq("id", userId);

  // Column may be missing until migration — metadata already saved.
  if (profileErr && !/app_role|column/i.test(profileErr.message)) {
    return { error: profileErr.message };
  }
  return { error: null };
}

export function needsAppRole(role: AppRole | null): boolean {
  return role == null;
}
