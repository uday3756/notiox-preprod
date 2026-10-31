# Deployment Guide - Time-Bound Scheduling System

## ✅ Status
- **GitHub:** ✅ Pushed to `main` branch
- **Vercel:** ⏳ Auto-deploying (watch for completion)
- **Database:** ⏳ Requires manual migration (see below)

---

## 📊 Deployment Timeline

### What Just Happened:
1. ✅ Code committed to GitHub (`f070bd8`)
2. ✅ Pushed to `https://github.com/uday3756/remix-of-pixel-perfect`
3. ⏳ Vercel auto-build triggered (in progress)

### What Happens Next:
1. Vercel builds the app
2. Tests run
3. Deploy to production at: `https://remix-of-pixel-perfect-ten.vercel.app`

---

## 🔧 CRITICAL: Apply Database Migrations

**⚠️ The app won't work until you apply the Supabase migrations!**

### Step 1: Go to Supabase Dashboard
- URL: https://supabase.com
- Project: `nexsus` (ref: `tfklcyinjvpvfyxltbzz`)

### Step 2: Open SQL Editor
- Click "SQL Editor" in the left sidebar
- Click "New Query"

### Step 3: Copy & Run Each Migration (In Order)

**Run these 5 migrations in the SQL Editor, one at a time:**

#### Migration 1: scheduling_nodes
```sql
-- [Copy from SCHEDULING_SETUP.md - Migration 1: scheduling_nodes table section]
```

#### Migration 2: user_working_hours
```sql
-- [Copy from SCHEDULING_SETUP.md - Migration 2: user_working_hours table section]
```

#### Migration 3: task_analytics
```sql
-- [Copy from SCHEDULING_SETUP.md - Migration 3: task_analytics table section]
```

#### Migration 4: scheduling_logs
```sql
-- [Copy from SCHEDULING_SETUP.md - Migration 4: scheduling_logs table section]
```

#### Migration 5: schedule_exceptions
```sql
-- [Copy from SCHEDULING_SETUP.md - Migration 5: schedule_exceptions table section]
```

### Step 4: Verify in Supabase
- Go to "Table Editor"
- Should see these new tables:
  - ✅ `scheduling_nodes`
  - ✅ `user_working_hours`
  - ✅ `task_analytics`
  - ✅ `scheduling_logs`
  - ✅ `schedule_exceptions`

---

## 🚀 Verify Vercel Deployment

### Watch Live Build:
1. Go to: https://vercel.com/uday3756s-projects/remix-of-pixel-perfect
2. Look for a new deployment in the "Deployments" tab
3. Wait for it to show ✅ "Ready"

### Test the App:
1. Once Vercel shows ✅ Ready, click the deployment
2. Click "Visit" or go to: https://remix-of-pixel-perfect-ten.vercel.app
3. Sign up with email/password
4. You should be redirected to `/auth-setup-hours`
5. Set your working hours
6. You should see the `/scheduling` page

---

## 📋 Environment Variables (Already Set)

Verify these are in Vercel (Settings → Environment Variables):
- ✅ `ANTHROPIC_API_KEY` — Claude API access
- ✅ `SUPABASE_URL` — Supabase project URL
- ✅ `SUPABASE_PUBLISHABLE_KEY` — Public key
- ✅ `SUPABASE_SERVICE_ROLE_KEY` — Server-side secret
- ✅ `VITE_SUPABASE_URL` — Client-side (same as above)
- ✅ `VITE_SUPABASE_PUBLISHABLE_KEY` — Client-side public key
- ✅ `VITE_SUPABASE_PROJECT_ID` — Project ID

If any are missing:
1. Go to Vercel → Project Settings → Environment Variables
2. Add the missing ones from your `.env` file
3. Redeploy

---

## 🧪 Testing After Deploy

### Test Flow:
1. **Signup**
   - Go to https://remix-of-pixel-perfect-ten.vercel.app
   - Click "Sign Up"
   - Enter email & password
   - Should redirect to `/auth-setup-hours`

2. **Set Working Hours**
   - Set timezone (auto-detected)
   - Set working days (Mon-Fri, 9-5)
   - Set break time (12-1 PM)
   - Click "Save Working Hours"
   - Should redirect to `/scheduling`

3. **Create a Task**
   - Click "+" (New Task) button
   - Record voice: _"I have a meeting tomorrow at 2 PM"_
   - Or type the same
   - Click "Submit"
   - Review extracted data
   - Click "Schedule It"
   - Task should appear in timeline

4. **View Calendar**
   - Should see the task in tomorrow's 2 PM slot
   - Navigate days with < Today >
   - Tasks outside working hours should show warning

---

## 🔍 Troubleshooting

### App shows blank page
- Check browser console for errors (F12 → Console)
- Check Vercel build logs: https://vercel.com/uday3756s-projects/remix-of-pixel-perfect/deployments

### "Table not found" error
- ❌ Migrations not applied
- Go to Supabase SQL Editor
- Run all 5 migrations from SCHEDULING_SETUP.md

### Claude API errors
- ❌ `ANTHROPIC_API_KEY` not set in Vercel env vars
- Go to Vercel → Settings → Environment Variables
- Add `ANTHROPIC_API_KEY=sk-ant-...`
- Redeploy

### Can't sign in
- ❌ Supabase connection issue
- Go to Supabase Settings → API
- Verify `SUPABASE_URL` matches in Vercel env vars

---

## 📊 Commits & Links

**GitHub Commit:**
```
f070bd8 - feat: Add Phase 1 Time-Bound Scheduling System
Branch: main
Repo: https://github.com/uday3756/remix-of-pixel-perfect
```

**Vercel Project:**
```
Project: remix-of-pixel-perfect
URL: https://remix-of-pixel-perfect-ten.vercel.app
Dashboard: https://vercel.com/uday3756s-projects/remix-of-pixel-perfect
```

**Supabase Project:**
```
Project: nexsus
Ref: tfklcyinjvpvfyxltbzz
Region: ap-northeast-2
URL: https://tfklcyinjvpvfyxltbzz.supabase.co
```

---

## ✅ Checklist Before Going Live

- [ ] 1. Commit pushed to GitHub ✅ Done
- [ ] 2. Vercel deployment complete (watch https://vercel.com/uday3756s-projects/remix-of-pixel-perfect)
- [ ] 3. Migrations applied to Supabase
- [ ] 4. Environment variables verified in Vercel
- [ ] 5. Test signup → setup → scheduling flow
- [ ] 6. Test voice capture & confirmation
- [ ] 7. Test working hours constraint (schedule outside 9-5)
- [ ] 8. Verify tasks persist in database

---

## 📞 Support

**If deployment fails:**
1. Check Vercel build logs for errors
2. Check Supabase table definitions
3. Verify env vars in Vercel match production URLs
4. Try redeploying from Vercel dashboard

**Next Steps:**
- Phase 2: Add drag-drop, edit UI
- Phase 3: Add behavior analytics, adaptive scheduling
- Integrations: Google Calendar, Slack, etc.

---

## Canvas MCP broker (preprod only)

The web app does **not** run `npx canvas-mcp-server` in the browser or in Vercel serverless. Host `services/canvas-mcp/` as a private HTTP broker:

1. Pin the upstream package after verifying [DMontgomery40/mcp-canvas-lms](https://github.com/DMontgomery40/mcp-canvas-lms). `canvas-mcp-server@2.3.1` previously returned npm E404 — do not invent a replacement.
2. Set `CANVAS_MCP_URL` + broker credential on the **server** only. Never put a student Canvas token in shared `VITE_*` env.
3. Isolate credentials per tenant/person/connection epoch. Do not mutate process env between users.
4. `/api/cron/canvas-sync` is daily (`0 11 * * *`). Do not claim 15-minute sync while the scheduler is daily.
5. `FEATURE_CANVAS_DISPATCH` is a **runtime** kill switch (`process.env` only). Baked `VITE_FEATURE_CANVAS_DISPATCH` cannot turn dispatch on.
6. Apply `20261101*` SQL on a reviewed staging/shared backup first. Flags stay OFF until that review.
7. Rollback: leave flags OFF, keep new tables. Do not delete XP/reminder history.
