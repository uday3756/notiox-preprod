# Staging setup and rollback

No deployment or remote migration was performed. Never apply this bundle to production as an automatic setup step.

## Before staging
1. Identify the real repository/commit and preserve Lovable history. This source ZIP has no Git metadata.
2. Create a separate staging Supabase project and backup. Record its migration history, schema differences, backup identifier and recovery procedure. Run supabase/tests/notio_preflight.sql read-only against the authorized staging project.
3. Review all migrations against the actual existing schema and policies. The isolated test uses a relevant schema fixture, not a complete copy of the remote database. Review any ambiguous links rather than matching by task titles.
4. Install with npm ci. Copy values from .env.handoff.example into your environment manager; never commit private keys. The Supabase service-role key belongs only on the server. Configure existing AI/billing integrations separately.
5. Test the baseline with npm test, npm run test:db and npm run build. Full TypeScript/lint are not clean in the source baseline.

## Migration and feature order
Apply the existing prerequisite migrations from staging's verified migration history, then these additive migrations in order:
- 20261023000100_canonical_completion.sql
- 20261023000200_reviewed_capture.sql
- 20261023000300_map_assignment_actions.sql
- 20261023000400_actionable_nudges.sql
- 20261023000500_confirmed_task_schedule.sql

Keep new flags OFF until validation. Match server FEATURE_WORKFLOW and build VITE_FEATURE_WORKFLOW; enable workflow on the migrated staging app before exposing task completion. Test returning users, preserved daily rings/calendar, billing and review/save recovery. Then separately enable Dolphin XP, Android widgets and eventually Canvas only after their individual gates pass. Never enable Canvas merely to bypass its incomplete integration.

The completion migration restricts direct task status writes. It is NOT compatible with blindly restoring an old direct-write client after disabling workflow. XP writes must stay restricted to the service transaction. Do not grant ordinary clients ledger/profile write access as a workaround.

Android: npm run build, npx cap sync android, then assembleDebug from android using the installed Java/Android SDK. Test HTTPS endpoints on an authorized staging deployment before device tests. Widget access tokens stay in Keystore-encrypted app storage, never snapshots; expired sessions need reauthentication. Current widget endpoint host is https://notiolive.com: review/configure it for staging before installing a pilot build. The supplied debug APK is local compile evidence, not a staging-connected release.

iOS is pending implementation, not just signing. Read ios/NOTIO_WIDGET_RELEASE.md. Canvas evaluation gates are in CANVAS_PILOT.md.

## Rollback
1. Stop new widget deliveries and new workflow writes, and retain an export/backup of tasks, completion actions, reward balances, ledger and draft tables.
2. Keep a known-compatible workflow app available while investigating. Do not deploy the legacy app until its direct completion writes have been reconciled with the guard trigger by a reviewed compatibility migration.
3. Do not drop ledgers, rewrite completion dates, or remove rewards to roll back UI changes. Disable XP presentation separately from stored confirmed progress.
4. A database restore requires an approved maintenance window and explicit loss/reconciliation analysis of writes since the backup. No destructive down migration is supplied.
5. Record rollback verification for completion/undo, ownership isolation, daily rings and calendar exports before reopening writes.

## Release gates
Use a consenting staging account for billing, voice permissions, two-device conflicts, Google auth/export retry failures and widget closed-app/offline/restart/account-switch tests. iOS needs Mac/Xcode/signing and physical devices. Canvas needs approved transport evaluation and per-user credential isolation. Final artwork/stage boundaries require approval. No production rollout until these checks and the remaining checklist in HANDOFF_IMPLEMENTATION.md are resolved.
