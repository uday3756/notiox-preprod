# Notio — Play Store & App Store deploy guide

This repo is a Capacitor shell around the live web app at `https://notiolive.com`.

## Prerequisites

- Google Play Developer account ($25)
- Apple Developer Program ($99/year) — **macOS + Xcode required for iOS builds**
- Privacy: https://notiolive.com/privacy-policy
- Terms: https://notiolive.com/terms

## One-time setup

```bash
npm install
npm run cap:sync
npm run cap:android   # opens Android Studio
# on a Mac:
npm run cap:add:ios
npm run cap:sync
npm run cap:ios
```

### Supabase / Google OAuth (native)

Add these to Supabase Auth → URL configuration:

- Site URL: `https://notiolive.com`
- Redirect allow-list:
  - `https://notiolive.com/**`
  - `https://notiolive.com/auth-setup-hours`
  - `com.notio.app://*` (if using custom scheme later)

Google Cloud OAuth client: keep Supabase callback  
`https://<project>.supabase.co/auth/v1/callback`

### RevenueCat (store IAP)

1. Create a RevenueCat project; add Apple + Google apps (`com.notio.app`).
2. Create entitlement `pro` and offerings matching monthly/annual/lifetime.
3. Set in Vercel (Production):
   - `VITE_REVENUECAT_IOS_KEY`
   - `VITE_REVENUECAT_ANDROID_KEY`
   - `REVENUECAT_WEBHOOK_SECRET` (optional but recommended)
4. Webhook URL: `https://notiolive.com/api/webhooks/revenuecat`
5. Redeploy web (VITE_ keys are build-time).

Web continues to use Stripe. Native apps use IAP only.

## Android (Play Console)

1. Android Studio → Build → Generate Signed Bundle / APK → **Android App Bundle**.
2. Create app `com.notio.app` in Play Console.
3. Fill Data safety (account, audio/transcripts, analytics).
4. Link privacy policy URL.
5. Upload AAB to **Internal testing**, then promote.

Permissions already declared: `INTERNET`, `RECORD_AUDIO`, `POST_NOTIFICATIONS`.

## iOS (App Store) — Mac only

1. `npx cap add ios` (if `ios/` missing).
2. Open `ios/App/App.xcworkspace` in Xcode.
3. Signing & Capabilities → your Team; Bundle ID `com.notio.app`.
4. Ensure `Info.plist` includes microphone usage (see `native/ios/Info.plist.additions`).
5. Archive → Upload to App Store Connect → TestFlight → Submit.

## Smoke checklist

- [ ] Cold open shows splash ≥ 5s then Maps (signed in) or landing (signed out)
- [ ] Capture mic prompt + Whisper transcription
- [ ] Google / email sign-in
- [ ] Pricing: native shows IAP (or clear “not configured” message); web uses Stripe
- [ ] Profile → Delete account
- [ ] Deep link `https://notiolive.com/maps` opens app (after App Links / Universal Links verified)
