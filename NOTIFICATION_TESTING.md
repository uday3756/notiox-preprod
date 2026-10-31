# Notification Testing Guide

## Overview
Notio now has **3 types of notifications**:

1. ✅ **Daily Wins Reminder** (browser notification)
2. ✅ **Weekly Report Ready** (email notification from cron)
3. ✅ **Weekly Report Manual Regenerate** (browser notification)

---

## 1. Daily Wins Reminder (Browser Notification)

### How it works:
- Fires at your configured wind-down time every day
- Only fires if you haven't recorded 3 wins yet today
- Doesn't fire if you've been active in the app in the last hour

### Test it:

**Step 1: Enable browser notifications**
```
1. Go to http://localhost:8080/profile
2. Find "Reminders" section
3. Toggle "Enable reminders" ON
4. Allow notifications when browser prompts
```

**Step 2: Set wind-down time**
```
1. Scroll to "Working Hours" section
2. Set "Wind-down reminder" to 2 minutes from now
   (e.g., if it's 4:05 AM, set to 4:07 AM)
3. Click "Save changes"
```

**Step 3: Wait for notification**
```
- At 4:07 AM, you'll get a browser notification:
  "Notio — 3 wins"
  "Take 20 seconds to mark today's wins."
- Click it to open the wins sheet
```

**Quick test without waiting:**
```
1. Click "Test notification" button in Profile
2. Should see a test notification pop up
```

---

## 2. Weekly Report Ready (Email Notification)

### How it works:
- Sent automatically when the cron job generates your weekly report
- Runs daily at 8:00 AM UTC
- Only sends on your configured "Weekly report day"

### Test it:

**Option A: Wait for automatic cron (real scenario)**
```
1. Go to http://localhost:8080/profile
2. Set "Weekly report day" to tomorrow's day of the week
3. Wait until tomorrow 8:00 AM UTC
4. Check your email inbox
5. You'll receive: "Your week in mind is ready"
```

**Option B: Manual trigger (instant test)**
```
1. Go to http://localhost:8080/weekly-report
2. Click "Regenerate" button (cyan pill)
3. Wait 5-10 seconds
4. Report generates ✓
5. NOTE: Manual regenerate does NOT send email
   (only the automatic cron sends email)
```

**To test the email locally:**
You need to manually trigger the cron endpoint:
```bash
# Set this in .env
CRON_SECRET=your-secret-token

# Then call the endpoint with curl (from PowerShell):
$headers = @{ "Authorization" = "Bearer your-secret-token" }
Invoke-WebRequest -Uri "http://localhost:8080/api/cron/weekly-report" -Headers $headers -Method GET
```

---

## 3. Weekly Report Manual Regenerate (Browser Notification)

### How it works:
- Fires immediately after you click "Regenerate" and it completes successfully
- Only fires if browser notification permission is granted

### Test it:

**Step 1: Enable browser notifications** (if not already done)
```
1. Go to http://localhost:8080/profile
2. Toggle "Enable reminders" ON
3. Allow notifications
```

**Step 2: Regenerate a report**
```
1. Go to http://localhost:8080/weekly-report
2. Click "Regenerate" button (cyan pill)
3. Wait 5-10 seconds for AI to generate
4. You'll see:
   - Toast: "Regenerated this week's report"
   - Browser notification: "Your week in mind"
     "Your weekly reflection report is ready to view."
```

---

## Notification Permission Check

All browser notifications require permission. Check current status:

**Chrome/Edge:**
```
1. Click the lock icon in the address bar
2. Look for "Notifications"
3. Should say "Allow" (not "Block" or "Ask")
```

**If blocked:**
```
1. Click the lock icon
2. Find Notifications → Change to "Allow"
3. Reload the page
4. Go to Profile → toggle "Enable reminders" OFF then ON
```

---

## Email Notification Requirements

For emails to send from the cron job:

✅ **Required env vars (already set in your Vercel):**
- `RESEND_API_KEY`
- `RESEND_FROM` (optional, defaults to onboarding@resend.dev)
- `CRON_SECRET` (secures the cron endpoint)

⚠️ **Domain verification:**
- Currently using Resend's shared sender: `onboarding@resend.dev`
- This only delivers to YOUR Resend account email: `udayhiremath46@gmail.com`
- To send to ALL users, verify your domain at resend.com/domains
- Then set `RESEND_FROM=Notio <reminders@yourdomain.com>`

---

## Quick Test Checklist

Run this sequence to test everything:

```
[ ] 1. Profile → Enable notifications → Allow in browser
[ ] 2. Profile → Set wind-down time to 2 min from now → Save
[ ] 3. Wait 2 minutes → Daily wins notification pops up ✓
[ ] 4. Profile → Set weekly report day to today → Save
[ ] 5. Go to /weekly-report → Click Regenerate
[ ] 6. Wait 10 seconds → Report appears ✓
[ ] 7. Browser notification pops: "Your week in mind" ✓
[ ] 8. Go back to /maps → See "Your week in mind" card ✓
[ ] 9. Check email (only if cron ran, not manual regenerate)
```

---

## Troubleshooting

**"No notification appeared"**
- Check browser permission (lock icon → Notifications → Allow)
- Check if you're in an incognito/private window (notifications often blocked)
- Try the "Test notification" button in Profile first

**"Email not received"**
- Check spam folder
- Confirm RESEND_API_KEY is set in Vercel
- Check Resend dashboard: resend.com/emails
- Remember: manual regenerate does NOT send email (only cron does)

**"Weekly report card not showing on /maps"**
- Generate a report first: /weekly-report → Regenerate
- Refresh the /maps page
- Card only appears if a report exists in the database

---

## Summary

| Feature | Type | When | Where |
|---------|------|------|-------|
| Daily wins reminder | Browser | At wind-down time | All pages (background hook) |
| Weekly report ready (cron) | Email | When cron generates report | Inbox |
| Weekly report regenerate | Browser | After manual regenerate | /weekly-report page |

All notifications respect the user's browser permission and can be tested right now on localhost!
