import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy-policy")({
  head: () => ({
    meta: [{ title: "Privacy Policy · Notio" }],
  }),
  component: PrivacyPolicy,
});

function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-bg text-foreground">
      <div className="mx-auto max-w-2xl px-6 py-16 lg:py-24">
        <h1 className="font-display text-4xl font-bold mb-8">Privacy Policy</h1>
        <p className="text-muted-foreground mb-6">Last updated: July 4, 2026</p>

        <div className="space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="font-semibold text-lg mb-3">1. Information We Collect</h2>
            <p>
              When you use Notio, we collect:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>Account Information:</strong> Email address, name, and authentication details (via Supabase/Google OAuth)</li>
              <li><strong>Mindmap Content:</strong> Transcripts, notes, and structured mindmap data you create</li>
              <li><strong>Schedule Data:</strong> Tasks, reminders, and calendar entries you input</li>
              <li><strong>Usage Data:</strong> Basic analytics on feature usage (anonymous, no content tracking)</li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold text-lg mb-3">2. How We Use Your Data</h2>
            <div className="space-y-2">
              <p>
                <strong>Mindmap Generation:</strong> Your transcript is sent to Anthropic (Claude API) <strong>only</strong> to structure it into a mindmap. Anthropic does not store your transcript after processing (see Anthropic's <a href="https://www.anthropic.com/legal/privacy" className="text-accent hover:underline">Privacy Policy</a>).
              </p>
              <p>
                <strong>Storage:</strong> Structured mindmaps and schedules are stored securely in our Supabase database. Only you can access your data.
              </p>
              <p>
                <strong>Reminders:</strong> We send email reminders via Resend. Reminders are based on your schedule data and timezone.
              </p>
            </div>
          </section>

          <section>
            <h2 className="font-semibold text-lg mb-3">3. Data Security</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>All data is encrypted in transit (HTTPS)</li>
              <li>User data is isolated with Row-Level Security (RLS) — you can only access your own data</li>
              <li>Authentication is handled by Supabase, a trusted backend-as-a-service provider</li>
              <li>API keys are kept server-side and never exposed to your browser</li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold text-lg mb-3">4. Data Retention</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Your Mindmaps & Schedules:</strong> Stored indefinitely until you delete them</li>
              <li><strong>Anthropic Transcripts:</strong> Not stored by Anthropic (processed then discarded)</li>
              <li><strong>Email Reminders:</strong> Delivery logs kept for 30 days</li>
              <li><strong>Session Tokens:</strong> Valid for 1 week; refresh automatically on login</li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold text-lg mb-3">5. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>Access:</strong> Download your data anytime from your profile</li>
              <li><strong>Delete:</strong> Delete individual mindmaps, schedules, or your entire account</li>
              <li><strong>Export:</strong> Mindmaps and tasks can be exported in standard formats</li>
              <li><strong>Opt-out:</strong> Disable email reminders in Notification Settings</li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold text-lg mb-3">6. Third-Party Services</h2>
            <p>We use:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>Anthropic Claude API:</strong> For mindmap generation</li>
              <li><strong>Groq:</strong> Optional voice transcription (Whisper) when enabled</li>
              <li><strong>Supabase:</strong> For database, auth, and RLS</li>
              <li><strong>Stripe:</strong> Web subscriptions</li>
              <li><strong>Apple / Google / RevenueCat:</strong> In-app subscriptions on store builds</li>
              <li><strong>Resend:</strong> For email reminders</li>
              <li><strong>Vercel:</strong> For hosting and deployment</li>
              <li><strong>Mixpanel:</strong> Optional product analytics</li>
            </ul>
            <p className="mt-3">Each service has its own privacy policy. We only send the minimum data needed.</p>
          </section>

          <section>
            <h2 className="font-semibold text-lg mb-3">6b. Account deletion</h2>
            <p>
              You can permanently delete your account in the app under{" "}
              <strong>Profile → Delete my account</strong>. This removes your maps and related data
              and deletes your auth user (App Store requirement).
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-lg mb-3">7. Compliance</h2>
            <p>
              Notio complies with GDPR, CCPA, and other privacy regulations. If you are in the EU or California, you have additional rights under these laws. Contact us for a data access request.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-lg mb-3">8. Contact</h2>
            <p>
              Questions about this policy? Email us at{" "}
              <a href="mailto:privacy@notiolive.com" className="text-accent hover:underline">
                privacy@notiolive.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
