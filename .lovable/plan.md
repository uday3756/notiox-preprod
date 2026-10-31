## ViewMind — Voice-to-Mindmap SaaS

A mobile-first thinking tool: user speaks → transcribed → AI structures thoughts → renders as an animated mindmap. Built from the uploaded spec.

This is a substantial app. I'll build it in phases so you can validate each layer before we go deeper. Phase 1 ships a usable product; later phases layer on intelligence and polish.

---

### Phase 1 — Foundation & Core Capture (this build)

**Design system**
- Dark theme: bg `#0B0D12`, surface `#141A26`, accent blue `#3B92FF`, cyan `#35E0F0` (matches the spec's PDF palette so brand stays consistent)
- Gradient "ViewMind" wordmark, generous spacing, Framer Motion transitions
- Mobile-first layout with bottom tab nav (Capture · Maps · Journal · Profile)

**Auth & backend (Lovable Cloud)**
- Email/password + Google sign-in
- `profiles` table (display name, role, avatar) with trigger on signup
- `maps`, `nodes`, `edges`, `journal_entries` tables with RLS scoped to `auth.uid()`
- Public landing page; app behind `_authenticated/`

**Voice capture**
- Big mic button on `/capture`, Web Speech API with Lovable AI Gateway STT fallback (`openai/gpt-4o-mini-transcribe`)
- Live transcript ticker while recording

**AI structuring**
- Server function calls Lovable AI (`google/gemini-3-flash-preview`) with the transcript, returns `{ title, nodes[], edges[] }` JSON
- Saves to DB, navigates to the new map

**Mindmap canvas**
- SVG + Framer Motion: draggable nodes, animated enter (scale 0.8→1, 50ms stagger), tap node → side sheet with details
- Auto-layout (radial from root)

**Landing page** — hero, "how it works" (3 steps), feature highlights, CTA → sign up

---

### Phase 2 — Organization (next prompt)
PARA folders, map list with search/filter, edit nodes, manual node add, share/export map as image.

### Phase 3 — Journal & habits (next prompt)
Daily journal entries (voice or text), date grouping, links journal topics back to mindmaps, streak tracking.

### Phase 4 — Background intelligence (next prompt)
Weekly AI insights ("you've been thinking a lot about X"), topic clustering across maps, personal coach prompt tuned to the user's role.

### Phase 5 — Polish & native (later)
Onboarding flow, push notifications, Capacitor wrapper for iOS/Android, paid tier with Stripe.

---

### Technical details

- **Stack**: TanStack Start (already scaffolded), Lovable Cloud (Supabase under the hood), Lovable AI Gateway (no API keys needed from you), Framer Motion, Tailwind v4
- **STT**: Web Speech API first (free, instant); falls back to Lovable AI `openai/gpt-4o-mini-transcribe` when unsupported (Firefox, some iOS)
- **AI structuring**: server function `structureThought` — Gemini Flash with `Output.object` Zod schema for `{ title, nodes: [{id,label,parentId?}] }`
- **DB**: `maps(id, user_id, title, created_at)`, `nodes(id, map_id, label, x, y, parent_id)`, `edges(id, map_id, source_id, target_id)`, `journal_entries(id, user_id, content, created_at)` — all with `user_id` based RLS
- **Routes**: `/` (landing, public), `/auth`, `/_authenticated/capture`, `/_authenticated/maps`, `/_authenticated/maps/$id`, `/_authenticated/journal`, `/_authenticated/profile`

### What I'll skip in Phase 1 (intentionally, to ship)
- Capacitor / native build
- Stripe payments
- Dexie offline cache (using TanStack Query cache instead)
- Multi-language STT
- Map sharing / collaboration

---

Approve to start Phase 1, or tell me what to change (e.g. "skip Google sign-in", "lighter theme", "start with mindmap canvas only").