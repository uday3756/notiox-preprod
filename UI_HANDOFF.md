# NotioX: corrected daily-progress-rings source, UI-only update

> Historical record of the earlier UI-only pass. The user subsequently approved functional, database, and native changes. See HANDOFF_IMPLEMENTATION.md and HANDOFF_TEST_RESULTS.md for the current scope and release status; the constraints below describe that earlier pass only.

## Source and constraints

Based on `remix-of-pixel-perfect-feature-daily-progress-rings.zip`, which supersedes the earlier main-branch ZIP. Applies the written visual direction from `NotioX_Uday_UI_Widget_Dolphin_Handoff.md`. The user's explicit requirement is no functional changes.

## Visual updates

- App background `#090D15`; solid navigation and Voice/Type surface `#121825`.
- Existing Capture, Maps, Home, Profile navigation retained, including link order, labels, destinations, and active-state logic.
- Capture: clearer layout, larger mode controls, calm recording/transcript styling, decorative Dolphin, accessible control names.
- Home: spacious rings presentation, readable time-block summaries, 44px date controls, and a restrained task list. Ring colors, segment geometry, totals, time blocks, capacities, celebrations, and date/task logic are preserved.
- Maps: more readable tile sizes, titles, and timestamps, with unchanged queries and the existing deleted-map filter.
- Onboarding and Profile: consistent spacing and surfaces. Original quiz, settings sections, ring settings, redirects, and persistence remain intact.
- Navigation uses a 700px maximum width, 16px radius, 24px desktop padding and 16px gaps; smaller padding and gaps adapt it to phones.

## Existing files edited

`src/styles.css`, `src/components/notio/bottom-nav.tsx`, `src/components/notio/daily-rings.tsx`, `src/routes/_authenticated/route.tsx`, `src/routes/_authenticated/capture.tsx`, `src/routes/_authenticated/home.tsx`, `src/routes/_authenticated/maps.index.tsx`, `src/routes/_authenticated/profile.tsx`, `src/routes/onboarding.persona.tsx`.

New files: `src/components/notio/dolphin-companion.tsx`, `public/dolphin/companion.png`, and this summary.

## Maps follow-up

- Plan is collapsed by default using a native keyboard-accessible details/summary disclosure. SchedulingSection remains mounted while closed, retaining local component state, existing queries, and task handlers.
- Gallery is now one horizontally scrolling row. Part of the following card remains visible, a scrollbar is shown, and labeled previous/next arrow buttons appear only when content overflows. Buttons disable at their respective ends. Touch, trackpad, focused keyboard scrolling, snapping, and reduced-motion scrolling are supported.
- List view, original map order/links/thumbnails, map queries, and all scheduling behavior are unchanged.
- Added `src/components/notio/horizontal-map-gallery.tsx`; changed only presentation markup in Maps and scoped CSS for this follow-up. No scheduling component, backend, dependency, or schema changes.
- Production build passed. Isolated browser checks cover desktop and phone widths, scroll endpoints, list/empty/single-map cases, keyboard disclosure, and retention of a child component's draft across collapse/expand. Live database writes are not exercised by these fixtures.

## Behavior and data

Underlying business handlers, query keys/functions, mutations, API contracts, authentication checks, route destinations, migrations, dependencies, and native code remain unchanged. The approved follow-ups add only presentation state for disclosures and report-load retry. The existing Journal-to-Home redirect remains untouched. No new XP policy, task completion system, Canvas LMS integration, native widget, transcript-review phase, or onboarding gate has been added. The Dolphin is decorative, uses the existing capture phase for presentation, and stores no progression state. Its new CSS motion respects reduced motion.

## Weekly report follow-up

- Latest report is displayed in full. Previous reports start collapsed in the existing single-open accordion, with date range, wins and completed-task counts.
- A shared report-body renderer retains metrics, wins, reflections, EF widgets and patterns. Existing regeneration, notifications, query invalidation and EF sheet/paywall handlers remain unchanged.
- Display-only filtering keeps the first occurrence of each ID, then the newest created_at entry per exact start/end period. Timestamp ties and period ordering retain response order. Distinct and overlapping periods remain accessible even when their content is identical. No saved rows are modified or deleted.
- Loading and empty states remain; load failures offer retry. Failed refreshes keep previously loaded reports visible.
- Changed weekly-report.tsx and scoped CSS; added src/lib/weekly-report-display.ts and its focused tests. No generation, cron, schema, access-check or period-calculation changes.
- Verification: 54 tests across 4 files passed; production build passed; baseline and edited TypeScript diagnostics remain 574 with no new diagnostics. Browser fixtures using the actual page function and real accordion/EF components cover 1440px, 390px and 320px widths, keyboard expansion, one-open history, zero-activity/overlapping periods, duplicate display filtering, regeneration refresh, cached/initial error retry, loading, empty/single states, and free/Pro EF sheets. Source comparisons confirm generation files, EF components and existing handlers are unchanged.
- Browser checks use isolated sample responses, not live personal reports or backend writes. Preview fixtures, local credentials, dependencies and generated build output are excluded from the ZIP.

## Checks

- Production build passed.
- Existing Vitest suite: 46 tests across 3 files passed.
- Original non-render function statements and on-event/disabled/value/checked/link bindings were compared using TypeScript ASTs and match the corrected ZIP.
- All original backend, migration, native, dependency and generated-route files remain byte-identical to the corrected ZIP.
- Baseline and edited TypeScript checks both report 574 diagnostics, with zero new diagnostics. Existing schema/type issues were not altered during this UI pass.
- Isolated browser fixtures use the actual edited JSX and real DailyRings renderer with sample data to review capture, rings, date-control presentation, and phone/desktop layouts. Fixtures and sample state are excluded from this archive.
- The full localhost app retains authentication for protected pages. Authenticated personal data, real task writes, transcription, AI generation, payments, and native behavior are not covered by the sample-state visual checks.
- The live landing and sign-in form render successfully. A direct visit to protected Home triggered one recoverable React hydration warning during its redirect to auth; React recovered and displayed the sign-in form without the error-boundary screen. Authentication source is byte-identical to the supplied ZIP. This warning is recorded rather than altering auth behavior in a UI-only change.

## Local run

Use `npm ci`, your existing environment settings, then `npm run dev`. Production build: `npm run build`. Local Supabase configuration was reused solely for the running preview and is excluded from this archive. No preview authentication bypass or mock backend is shipped.

## Asset provenance

`public/dolphin/companion.png` is the same generated 2D Dolphin used in the earlier UI pass; it is not an approved final brand export. Its prompt requested one friendly blue dolphin, pale belly, clean outline, flat shading, transparent background, with no text or surrounding objects. Replace this asset when final artwork is supplied. The original handoff's external reference-image attachments were not supplied, so the layout follows its written specifications.
