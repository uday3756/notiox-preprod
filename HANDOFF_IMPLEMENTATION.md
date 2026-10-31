# Full handoff implementation and release gates

## Baseline
- Target: corrected daily-progress-rings ZIP plus the existing UI/Maps/Weekly Report updates.
- Original archive SHA-256: C0141EA9A9372E6E8BB42E1EB7357329C13272E835960F459F2B567E972A51CB.
- This folder has no .git metadata. Repository/branch/deployed commit are unverified. Do not push or rewrite Lovable history.
- Previous deliverable NotioX_Daily_Progress_Rings_Weekly_Report_Update.zip is the pre-change backup.
- Prior verification: 54 tests passed; production build passed; 574 pre-existing TypeScript diagnostics.
- Applied remote migrations and deployment identity are NOT verified. No remote schema/data changes or deployments are authorized by this task.

## Approved decisions
- Full functional scope supersedes the earlier UI-only restriction.
- Home / Plan / Capture / Maps / You; preserve Journal access.
- 10 XP per eligible leaf/standalone task, level 1 + floor(XP/100); no parent bonus or historical XP. Undo reverses; recompletion restores.
- Android widgets first, then iOS. No visual evolution until final art/stage approval.
- One-student Canvas pilot; evaluate the named MCP before selecting a production adapter. No automatic direct-API fallback without approval.
- Date-change label 48h, stale 24h, overdue Sort later 24h. Opt-in reminders max 3/day, quiet 22:00-08:00 local, pause after two ignored nudges.

## Deployment safety
- New workflow, XP, native-widget and Canvas flags default OFF. Configure matching FEATURE_* server and VITE_FEATURE_* build values only in staging after required migrations pass.
- Back up staging and production independently before migrations. Test forward migration and data assertions in a disposable local database first.
- No destructive down migration is provided: disable UI flags, stop new workers and restore the previous app only after checking compatibility. Preserve new completion/ledger records; never delete earned progress to roll back a UI.
- Before granting release approval, record actual repository commit, database migration versions, backup identifier, integration credentials owner, and physical-device results here.

## Acceptance status
- Implemented, locally checked: five-tab navigation, optional/resumable onboarding, editable capture review, stable generation/save IDs, explicit editable map save, existing billing checks and legacy generation interface.
- Implemented, locally checked: canonical task/step editing and completion, assignment detail and notes, map-to-step destination confirmation, note-only Add to essay, working-hours review and explicit schedule confirmation. Existing articulation and own_words are retained.
- Implemented, locally checked: SVG descendant deletion with stable framing, long-label search, zoom/Fit/fullscreen/Escape, reduced-motion and companion-off handling. Daily rings and Maps/Weekly Report improvements are retained.
- Implemented, isolated database checked: ownership/revision/idempotency transaction, reversible 10-XP leaf rewards, no parent or backfill rewards, alias-safe reward identity, ring compatibility updates, durable calendar export outbox.
- Implemented, locally checked: opt-in in-app nudges with daily cap, quiet hours, snooze and pause after two ignores. This is not an OS push or email delivery implementation; existing notification paths are unchanged.
- Implemented, Android compiled: native compact/list widgets, private-title mode, encrypted account-scoped outbox, pending feedback, authenticated versioned snapshot/completion endpoints, retry/conflict/account cleanup. Physical-device behavior remains unverified.
- Pending implementation: iOS WidgetKit extension and interactive/read-only fallback. ios/NOTIO_WIDGET_RELEASE.md records required platform access. Android build success is not evidence of iOS support.
- Blocked: Canvas transport selection and live import/sync. Only transport-neutral types, timing policies, tests and evaluation rubric exist. The named npm package returned E404; approval to evaluate pinned source plus a consenting pilot account is outstanding. No production adapter was installed.
- Blocked: staging schema reconciliation, real two-device/authenticated integration checks, physical Android device, Mac/Xcode/signing/iOS device, final Dolphin expression/stage artwork approval. Starter artwork is development-only; evolution remains disabled.
- Pending integration hardening: calendar exports are attempted after commit and retained on failure, retried by subsequent mutations. A scheduled/leased retry worker, automatic retry evidence during a quiet account, and visible exhausted-retry recovery are not yet implemented. Do not claim guaranteed background delivery.
- Pending security review: full existing dependency audit and full existing lint/type baseline remediation. No broad dependency upgrades were performed.
- Full handoff is NOT release-complete. See HANDOFF_SETUP_ROLLBACK.md for safe staging setup, and HANDOFF_TEST_RESULTS.md for evidence and limitations.
