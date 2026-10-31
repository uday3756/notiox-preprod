---
cursor:
  subagentId: "bc-4f51db19-8b43-5ac0-a629-d88b93f3cd79"
---

# NotioX CEO handoff — implemented vs missing audit

**Audit date:** 2026-10-29  
**Working folder:** `C:\Users\unti\Desktop\NotioX_Handoff_Staging_Implementation\remix-of-pixel-perfect-feature-daily-progress-rings`  
**Primary handoff source:** `C:\Users\unti\Downloads\NotioX_Uday_UI_Widget_Dolphin_Handoff.md` (Julian → Uday, 2026-10-01)  
**Supporting staging notes in tree:** `HANDOFF_IMPLEMENTATION.md`, `HANDOFF_SETUP_ROLLBACK.md`, `HANDOFF_TEST_RESULTS.md`, `UI_HANDOFF.md`, `CANVAS_PILOT.md`, `ios/NOTIO_WIDGET_RELEASE.md`  
**Scope:** Verification only. No fixes, no deploys, no invented assets.

## Summary

| Status | Count |
| --- | ---: |
| Implemented | 14 |
| Partially implemented | 14 |
| Not implemented | 8 |
| Unclear / needs product decision | 4 |
| **Total checklist items** | **40** |

**Verdict:** Large portions of Cycle 1 (nav, colors, workflow/XP scaffolding, capture review behind flags, SVG tools, Android widget code, migrations) exist in this staging ZIP. The handoff is **not release-complete**: iOS widgets, live Canvas adapter, physical-device verification, staging schema apply, approved Dolphin stage artwork, and several recovery UX surfaces are missing. Feature flags default **OFF**.

---

## Checklist

Status legend: **Done** · **Partial** · **Missing** · **Unclear**

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Bind handoff to named repo, branch, full commit SHA | **Missing** | Folder has no `.git`. `HANDOFF_IMPLEMENTATION.md` states repository/branch/deployed commit unverified. ZIP identity only. |
| 2 | App background `#090D15`; tab surface `#121825` | **Done** | `src/styles.css` sets `--background: #090D15` and `--notiox-tab-container: #121825`; used by bottom nav / capture surfaces. |
| 3 | Five-tab nav: Home / Plan / centered Capture / Maps / You; Journal reachable | **Done** | `src/components/notio/bottom-nav.tsx`; Journal route `src/routes/_authenticated/journal.tsx` retained (not in bottom bar). |
| 4 | Dolphin on onboarding; capture without mandatory Canvas/widget setup | **Done** | `src/components/notio/quick-onboarding.tsx`, `onboarding.persona.tsx` show `DolphinCompanion`. Canvas/widget are flag-gated and optional. |
| 5 | Optional / resumable short onboarding (skip Canvas, widget, long quiz gate) | **Partial** | `quick-onboarding.tsx` + `workflow-onboarding.ts` allow skip-to-capture. Legacy persona quiz + hours routes still exist; default OAuth redirect in `auth-redirect.ts` still points at `/onboarding/persona`. |
| 6 | Post-stop transcript review/edit before generation | **Partial** | Review/preview phases in `capture.tsx` when `FEATURE_FLAGS.workflow`. `stop()` still enters `finalize()`, which only opens review if workflow is on; with flags OFF, immediate generate/persist remains. |
| 7 | Preview draft map / choose next action; generation ≠ XP | **Partial** | Workflow path: draft → preview → explicit save (`capture.tsx`, `capture-draft.*`, migration `20261023000200_reviewed_capture.sql`). Gated by `FEATURE_WORKFLOW`. |
| 8 | Stable generation/save request IDs / idempotency | **Partial** | Capture draft + request refs present under workflow; claimed in `HANDOFF_IMPLEMENTATION.md`. Not fully verified live here (no `.env` / auth). |
| 9 | Canonical completion + XP ledger transaction (ownership, revision, idempotency) | **Done** (code) | `supabase/migrations/20261023000100_canonical_completion.sql`; `src/lib/task-completion.server.ts`, `task-completion.functions.ts`; DB tests claimed in `HANDOFF_TEST_RESULTS.md`. Staging apply unverified. |
| 10 | 10 XP per eligible leaf/standalone; level `1 + floor(XP/100)`; no parent bonus; no historical backfill; undo reverses; recomplete restores | **Done** (code) | `src/lib/dolphin-progression.ts` (`XP_POLICY`); SQL reward eligibility; `dolphin-progression.test.ts`. |
| 11 | Home/Today surfaces next actionable work including undated steps | **Partial** | `src/routes/_authenticated/home.tsx` + `actionable-tasks.tsx` under workflow. Legacy `SchedulingSection` still filters timed pending tasks on Maps. |
| 12 | Assignment detail with ordered independently completable steps | **Partial** | `assignments.$id.tsx` + steps via `parent_node_id`. No built-in 5-step essay template (thesis → proofread) from CEO §6; users create steps manually / from map. |
| 13 | Map “Make it a step” with destination confirm; “Add to essay” note-only | **Done** | `src/components/notio/map-task-actions.tsx`; `assignment_notes` migration `20261023000300_map_assignment_actions.sql`. |
| 14 | Working-hours / schedule review with explicit confirmation | **Partial** | `TaskSchedule`, scheduling confirmation components retained; confirmed-schedule migration `20261023000500_confirmed_task_schedule.sql`. Full product path depends on workflow flags + staging schema. |
| 15 | Preserve Branch-of-Thought / `own_words` articulation | **Done** | Existing mindmap canvas + `nodes.own_words` path retained (`mindmap-canvas.tsx`; prior migrations). |
| 16 | One completion rule across Home, assignment, maps, widgets | **Partial** | Shared `use-task-completion` / `notio_set_completion` for app + Android endpoints. iOS widget missing; physical Android unverified. |
| 17 | Duplicate tap / retry / two-device / import-merge cannot inflate XP | **Partial** | DB uniqueness + action idempotency implemented in migration/tests. Two-device live check and Canvas merge not done. |
| 18 | Dolphin emotions: welcome/listening/thinking/happy/level_up/reassuring | **Partial** | `DolphinEmotion` type + `data-state` on `dolphin-companion.tsx`. **Single** starter image `public/dolphin/companion.png` — no per-expression or stage asset sets. |
| 19 | Companion-off + reduced-motion keep tasks usable | **Done** | `companion_enabled` preference; CSS `@media (prefers-reduced-motion: reduce)` in `styles.css` / canvas. |
| 20 | Evolution stages / visual stage boundaries | **Missing** | No `stageForLevel` / multi-asset stages. Handoff notes evolution disabled pending art approval. |
| 21 | Offline queued completion shows pending vs confirmed XP | **Partial** | Android outbox + “pending” feedback described in native code / handoff notes. No clear `pendingXp` field in web `dolphin-progression.ts`. Device behavior unverified. |
| 22 | Android home-screen widget (compact/list, private titles, durable outbox, authenticated snapshot/completion APIs) | **Partial** | Java provider/store/worker/plugin + layouts + manifest receiver; `widget-completion.server.ts` (`/api/v1/widgets/*`); `FEATURE_NATIVE_WIDGETS`. Compile claimed; **physical device not verified**. |
| 23 | Widget completes while main app/WebView closed | **Missing** (verified) | Code path exists for Android; acceptance requires physical-device proof — absent. |
| 24 | iOS WidgetKit extension + interactive/read-only fallback | **Missing** | `ios/NOTIO_WIDGET_RELEASE.md` = pending. No `NotioWidget` target/Swift files. |
| 25 | Clear widget data on sign-out / account switch; auth expiry UX | **Partial** | Android classes include account cleanup hooks per handoff notes; not device-tested. |
| 26 | Canvas transport-neutral types + timing policies (48h changed, 24h stale, Sort later 24h) | **Partial** | `src/lib/canvas.types.ts`, `canvas-policy.ts` (+ tests). No production sync adapter. |
| 27 | Opt-in actionable nudges: max 3/day, quiet 22:00–08:00 local, pause after 2 ignores | **Done** (code) | `canNudge` in `canvas-policy.ts`; `actionable-nudge.tsx`; `task-nudges.functions.ts`; migration `20261023000400_actionable_nudges.sql`. In-app only (not OS push). |
| 28 | Canvas MCP/API measured comparison + one chosen adapter | **Missing** | `CANVAS_PILOT.md`: `canvas-mcp-server@2.3.1` → E404. No `canvas-mcp.server.ts` / `canvas-sync.server.ts` / connection card. `FEATURE_CANVAS_PILOT` unused for real sync. |
| 29 | Canvas recovery UX (failed connect, deadline change, no date, overdue, duplicate, stale, disconnect) | **Missing** | Policy helpers only; no `canvas-connection-card` or Profile wiring for live Canvas states. |
| 30 | “Steps done in NotioX” ≠ “Submitted in Canvas” without evidence | **Partial** | Label helpers in `canvasDisplayState`; assignment UI shows “steps done in NotioX”. No live submission status integration. |
| 31 | SVG: stable IDs, descendant delete framing, long labels, pan/zoom/Fit/fullscreen/Escape | **Partial** | `map-viewport.ts`, Fit/fullscreen/Escape in `mindmap-canvas.tsx`. `deleteNode` still calls `refetch()` after delete — jitter risk may remain. Handoff claims local browser fixtures; not re-run in this audit. |
| 32 | Feature flags OFF until staging gates (`WORKFLOW`, `DOLPHIN_XP`, `NATIVE_WIDGETS`, `CANVAS_PILOT`) | **Done** | `src/lib/feature-flags.ts`; `.env.handoff.example` defaults false. Note: main `.env.example` omits these four keys. |
| 33 | Migrations additive; no destructive down migration | **Done** (files) | Five `20261023*.sql` migrations present. Remote/staging apply **not** done in this tree. |
| 34 | Durable Google calendar export outbox after completion | **Partial** | `completion_export_outbox` + post-commit retry in `task-completion.server.ts`. **No** scheduled/leased retry worker / exhausted-retry UX (`HANDOFF_IMPLEMENTATION.md`). |
| 35 | Preserve billing checks / legacy generation interface | **Done** | Existing `structureThought` / billing paths retained; workflow wraps rather than replaces wholesale. |
| 36 | Maps gallery / Weekly Report UI follow-ups from `UI_HANDOFF.md` | **Done** | Horizontal gallery component; weekly-report display filtering (`weekly-report-display.ts`). Extra relative to CEO core list but present. |
| 37 | Full TS/lint clean + dependency security triage | **Missing** | Docs: ~570 TS diagnostics; ~2k lint issues; npm audit findings. Not remediated. |
| 38 | Staging schema reconciliation + authenticated two-device/integration tests | **Missing** | Explicitly unverified in `HANDOFF_TEST_RESULTS.md`. No `.env` in this checkout. |
| 39 | Final approved Dolphin expression/stage artwork | **Missing** | Starter `companion.png` only; UI_HANDOFF says replace when final art supplied. Reference PNGs live in Downloads, not in repo. |
| 40 | Release-complete production handoff | **Missing** | `HANDOFF_IMPLEMENTATION.md`: “Full handoff is NOT release-complete.” |

---

## Asset needs (user-supplied — do not invent)

| Need | Where used | Notes |
| --- | --- | --- |
| Final Dolphin expression set (calm, welcome, listening, thinking, happy, level_up, reassuring) | `dolphin-companion.tsx` → `/dolphin/companion.png` | One starter PNG exists; expressions are CSS/`data-state` only. |
| Evolution / stage artwork sets | Progression “stage” dimension | Intentionally disabled until approval. |
| CEO visual references `image.png` … `image(8).png` | Design QA only | Found under `C:\Users\unti\Downloads\` (image.png, image (1)–(6).png present; confirm (7)/(8)). **Not** copied into the app repo. |
| Landing demo video | `DemoVideo.tsx` looks for `/demo-walkthrough.mp4` or `.mov` | `public/demo-walkthrough.mov` exists; `.mp4` absent. |
| Profile avatars | `profile.tsx` `avatar_url` | User/OAuth-supplied; no mascot invent. |
| App icons / splash | `assets/`, `icons/`, `public/logo.png` | Existing brand rasters present; not Dolphin stage art. |
| Android/iOS widget Dolphin bitmaps | Native widget layouts | Likely need dedicated sized assets when polishing widgets; current layouts should be reviewed before store screenshots. |

**Do not generate** replacement mascots/avatars/GIFs unless the user supplies art or explicitly requests generation later.

---

## Implemented but not in CEO handoff (extras)

These exist in the staging tree and are outside (or only lightly adjacent to) the Oct 1 CEO handoff core:

- Daily progress rings (`daily-rings.tsx` and related)
- Weekly report + EF-adjacent surfaces (`weekly-report.tsx`, etc.)
- Support tickets routes
- Horizontal map gallery polish (`horizontal-map-gallery.tsx`)
- RevenueCat Capacitor purchases wiring
- Mixpanel analytics
- Landing marketing sections / demo video
- Persona quiz retained alongside new quick onboarding
- Prior CR scheduling/lead-time/notification work already in CLAUDE.md history

---

## Deploy readiness notes (list only — no deploy)

**Blockers / prerequisites for localhost + a new Vercel project:**

1. **No `.env` / `.env.local`** in this handoff folder — must create from `.env.example` + `.env.handoff.example`.
2. **`node_modules` absent** — run `npm ci` (or install) before `npm run dev` / `build`.
3. **No git metadata** in the ZIP folder — new Vercel project needs a GitHub repo/branch strategy (do not force-push Lovable history; see `AGENTS.md` / handoff).
4. **Separate staging Supabase project** recommended; apply prerequisite migrations then the five `20261023*` migrations in order (`HANDOFF_SETUP_ROLLBACK.md`).
5. **Secrets / keys to configure** (never put service role in `VITE_*`):
   - `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, matching `VITE_SUPABASE_*`
   - `ANTHROPIC_API_KEY`, optional `OPENROUTER_API_KEY`, `GROQ_API_KEY` (voice)
   - `RESEND_API_KEY` / auth email sender
   - `CRON_SECRET`
   - Stripe price/secret keys if billing exercised
   - Google Calendar OAuth client/secret/redirect if calendar used
   - Optional `OPENAI_API_KEY` only if RAG flag on
6. **Handoff feature flags** must be set **identically** on server (`FEATURE_*`) and client build (`VITE_FEATURE_*`); keep OFF until migrations validated.
7. **New Vercel project** must set all `VITE_*` before/at build; Nitro vercel preset already in `vite.config.ts` / `vercel.json`.
8. **Auth redirect allow-list** must include `http://localhost:8080/**` and the new Vercel domain(s).
9. **Android widget host** currently oriented at `https://notiolive.com` — reconfigure for staging before pilot APK.
10. **Canvas pilot** blocked on published MCP package choice + consenting student token/domain.
11. **iOS widgets** need Mac/Xcode/signing/App Group — not unblocked by Android compile.
12. **Typecheck/lint/security** are not clean gates; do not treat green `npm run build` alone as release approval.

---

## Recommended fix order (brief)

1. **Environment + staging DB:** `.env`, `npm ci`, separate Supabase, run preflight + `20261023*` migrations, keep flags OFF, smoke auth.
2. **Turn on `FEATURE_WORKFLOW` (+ matching Vite flag) in staging only;** verify capture review → save, Home/assignments, Make-it-a-step, completion undo.
3. **Enable `FEATURE_DOLPHIN_XP` after ledger checks;** confirm 10 XP leaf rules; replace starter Dolphin with **user-supplied** expression assets when ready.
4. **SVG delete/viewport hardening** if jitter still reproduces after stable framing work.
5. **Calendar outbox leased retry + visible exhausted-retry recovery.**
6. **Android physical-device widget matrix** (closed app, offline, restart, account switch); then iOS WidgetKit.
7. **Canvas:** resolve MCP package/source pin, measure vs direct API, implement one adapter + connection UI — only after pilot credentials.
8. **TS/lint/security triage** as an explicit release gate, not drive-by upgrades.
9. **Bind release to a real git SHA** and record backup/migration IDs before any production flag flip.

---

## Sources consulted

- `C:\Users\unti\Downloads\NotioX_Uday_UI_Widget_Dolphin_Handoff.md`
- `...\remix-of-pixel-perfect-feature-daily-progress-rings\HANDOFF_IMPLEMENTATION.md`
- `...\HANDOFF_SETUP_ROLLBACK.md`, `HANDOFF_TEST_RESULTS.md`, `UI_HANDOFF.md`, `CANVAS_PILOT.md`, `ios\NOTIO_WIDGET_RELEASE.md`
- Code paths listed in the checklist Evidence column under the remix app root above
