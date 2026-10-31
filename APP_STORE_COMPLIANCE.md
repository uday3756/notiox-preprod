# Notio — App Store & Play Store Compliance Guide

**CRITICAL:** Failing these checks = app rejection or removal. Review before submitting.

---

## DEAL-BREAKERS (Automatic Rejection)

### 1. Payment Must Use App Store IAP / Google Play Billing
- BANNED: Stripe payments inside iOS/Android app
- BANNED: Links to "Pay on our website" inside app
- REQUIRED: Apple In-App Purchase (StoreKit 2)
- REQUIRED: Google Play Billing Library

### 2. Privacy Policy Must Be Present
- Hosted on HTTPS (not within app)
- Linked from app metadata
- Updated within last 12 months
- Discloses what data you collect

### 3. Age Rating Questionnaire
- Must complete for all platforms
- Notio = likely 4+ (productivity app)

---

## HIGH-RISK ITEMS

### 4. Sign-In Requirements
- ALLOWED: "Sign in with Apple" (iOS) / "Sign in with Google" (Android)
- NOT ALLOWED: Require sign-up before showing demo
- BEST PRACTICE: Show demo, then ask for sign-in

### 5. Subscription Transparency
- Show price, duration, auto-renewal in app
- Easy cancellation (iOS: Settings → Subscriptions)
- Clear free trial terms
- State when charge will occur

### 6. No Crashes or Bugs
- Test on real devices
- Test core flows: sign-in → capture → create → delete
- Test minimum iOS version (15+)
- Check permission crashes (microphone, camera)

### 7. Permissions & Justification
- Microphone: Ask permission, declare usage
- Camera: Declare usage
- Location: Only if needed (Notio doesn't)

---

## MEDIUM-RISK ITEMS

### 8. Accurate Metadata
- App name matches in-app name
- Screenshots show real app
- Description doesn't oversell
- Keywords relevant to functionality

### 9. No References to Other Platforms
- NO: "Download on Android" inside iOS app
- OK: Mention web/desktop in App Store description

### 10. Content Moderation
- User-generated content: State policy
- "Notio does not moderate user content" is acceptable
- Must have abuse reporting

### 11. Test Account for Reviewers
Test Account Email: reviewer@notio.app
Free Account: Yes
Pro Access: Free for testing (sandbox)

---

## PRE-SUBMISSION CHECKLIST

Architecture & Code:
- [ ] Native iOS app built (Swift or React Native)
- [ ] Native Android app built (Kotlin or React Native)
- [ ] IAP implemented for iOS (StoreKit 2)
- [ ] Google Play Billing implemented for Android
- [ ] Stripe removed from mobile app code
- [ ] No crashes on fresh install
- [ ] No crashes on core workflows
- [ ] Tested on minimum iOS 15+
- [ ] Tested on minimum Android API 28+

Metadata & Legal:
- [ ] Privacy Policy written + hosted on HTTPS
- [ ] Terms of Service written
- [ ] Age rating questionnaire completed
- [ ] Keywords updated (5-10 terms)
- [ ] Screenshots (5-10) showing real app
- [ ] Description matches features
- [ ] Support email configured

Payments:
- [ ] IAP set up in App Store Connect
- [ ] Subscription product created with correct price
- [ ] Free trial labeled clearly
- [ ] Sandbox testing account works
- [ ] Subscription receipt validation working
- [ ] Cancel button in Settings → Subscriptions (iOS)
- [ ] Cancel button in Google Play → My Subscriptions (Android)

Features:
- [ ] Voice capture works
- [ ] Maps can be created/edited/deleted
- [ ] Working hours editor works
- [ ] Schedule extraction works
- [ ] Email reminders enabled (if launching)

Security:
- [ ] CRON_SECRET set in backend
- [ ] Stripe checkout validations in place
- [ ] No hardcoded API keys
- [ ] HTTPS for all API calls
- [ ] No debug logging of sensitive data
- [ ] Supabase RLS verified

Testing:
- [ ] Tested on iPhone (latest + previous gen)
- [ ] Tested on iPad (if universal)
- [ ] Tested on Android flagship
- [ ] Tested on Android budget device
- [ ] Network connectivity handled
- [ ] Large maps don't crash
- [ ] Permissions flow tested

---

## SUBMISSION STEPS

iOS (App Store):
1. Build signed IPA
2. Upload to TestFlight (beta test first)
3. Wait 24-48h for TestFlight review
4. Fix any issues
5. Submit to App Store
6. Wait 24-48h for review
7. If rejected: read feedback, fix, resubmit

Android (Google Play):
1. Build signed APK + AAB
2. Create Google Play listing
3. Upload AAB to Play Store Console
4. Fill in store listing fields
5. Request review
6. Usually approved in 1-2 hours
7. If rejected: read feedback, fix, resubmit

---

## COMMON REJECTION REASONS

| Reason | Fix |
|--------|-----|
| Payment outside App Store | Remove Stripe, add IAP |
| Missing Privacy Policy | Host on HTTPS, link in metadata |
| Requires sign-up before demo | Add demo before login |
| Screenshots don't match app | Use real app screenshots |
| Crashes on startup | Test on real device, fix permissions |
| Vague description | Be specific about features |
| Content moderation missing | State: "Users responsible for content" |

---

## TIMELINE

Step | Duration
-----|----------
iOS build + sign | 1 day
TestFlight review | 24-48h
App Store review | 24-48h
Android build | 1 day
Play Store review | 1-2h
TOTAL | 3-5 days (assuming no rejections)

---

## REVENUE AFTER LAUNCH

Platform | Fee | Revenue per $100 | Notes
---------|-----|------------------|------
Stripe (web) | 2.9% + $0.30 | $96.80 | Keep for web users
Apple IAP | 30% | $70 | Unavoidable
Google Play | 30% | $70 | Unavoidable
Average | ~15% | $85 | Blended (web + mobile)

---

## NEXT STEPS

1. DONE: Rebrand to Notio
2. DONE: Security audit (5 vulns fixed)
3. TODO: Write Privacy Policy (2-3 hours)
4. TODO: Write Terms of Service (1-2 hours)
5. TODO: Design app icon (512x512 PNG)
6. TODO: Create 5-10 screenshots
7. TODO: Build native iOS app (2-4 weeks)
8. TODO: Build native Android app (2-4 weeks)
9. TODO: Implement IAP + Play Billing (1 week)
10. TODO: Full QA testing (1 week)
11. TODO: Submit + Review (3-5 days)

Cost: $124/year (Apple $99 + Google $25 dev accounts)
Timeline: 6-8 weeks from native app start to live on both stores
