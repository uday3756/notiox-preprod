import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2, ImageUp, X, CheckCircle2, Gift, LifeBuoy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NotioLogo } from "@/components/notio/logo";
import { submitSupportTicket } from "@/lib/support.functions";
import { TICKET_TYPES } from "@/lib/support";

export const Route = createFileRoute("/_authenticated/support")({
  component: SupportPage,
});

const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

type Success = { ticketId: string; credits: number };

function SupportPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const submitFn = useServerFn(submitSupportTicket);
  const fileRef = useRef<HTMLInputElement>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [ticketType, setTicketType] = useState<string>("bug_report");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ subject?: string; description?: string; file?: string }>({});
  const [success, setSuccess] = useState<Success | null>(null);

  // Prefill name + email from the logged-in user.
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setUserId(u.user.id);
      setEmail(u.user.email ?? "");
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", u.user.id)
        .maybeSingle();
      if (profile?.display_name) setName(profile.display_name);
    })();
  }, []);

  function pickFile(f: File | null) {
    setErrors((e) => ({ ...e, file: undefined }));
    if (!f) {
      setFile(null);
      setPreview(null);
      return;
    }
    if (!ACCEPTED.includes(f.type)) {
      setErrors((e) => ({ ...e, file: "Use a PNG, JPG, JPEG or WEBP image." }));
      return;
    }
    if (f.size > MAX_BYTES) {
      setErrors((e) => ({ ...e, file: "Image must be under 5 MB." }));
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function uploadScreenshot(): Promise<string | null> {
    if (!file || !userId) return null;
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("support-attachments")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new Error("Screenshot upload failed. Please try again.");
    const { data } = supabase.storage.from("support-attachments").getPublicUrl(path);
    return data.publicUrl;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors: typeof errors = {};
    if (!subject.trim()) nextErrors.subject = "Subject is required.";
    if (!description.trim()) nextErrors.description = "Please describe the issue.";
    setErrors((prev) => ({ ...prev, ...nextErrors }));
    if (nextErrors.subject || nextErrors.description) return;

    setBusy(true);
    try {
      const screenshotUrl = await uploadScreenshot();
      const res = await submitFn({
        data: {
          ticketType: ticketType as (typeof TICKET_TYPES)[number]["value"],
          fullName: name.trim(),
          email: email.trim(),
          subject: subject.trim(),
          description: description.trim(),
          screenshotUrl: screenshotUrl ?? undefined,
        },
      });
      // Reflect the newly-awarded credits + new ticket everywhere.
      qc.invalidateQueries({ queryKey: ["billing-status"] });
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      setSuccess({ ticketId: res.ticketId, credits: res.creditsAwarded });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't submit your ticket.");
    } finally {
      setBusy(false);
    }
  }

  // ---- Success screen ----
  if (success) {
    return (
      <div className="mx-auto max-w-md px-6 pt-10 pb-28">
        <div className="flex items-center justify-between">
          <NotioLogo className="text-xl" />
          <span className="text-xs text-muted-foreground">Support</span>
        </div>
        <div className="mt-10 rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
          <h1 className="mt-4 font-display text-2xl font-bold">Ticket Submitted Successfully</h1>
          <p className="mt-2 text-sm text-muted-foreground">Thank you for helping us improve the app.</p>
          <div className="mt-5 rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Your ticket ID</p>
            <p className="mt-1 font-display text-lg font-semibold tracking-wide">{success.ticketId}</p>
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-primary/10 px-4 py-3 text-sm font-medium text-primary">
            <Gift className="h-4 w-4" />
            You received {success.credits} bonus AI Mind Map credits for reporting an issue.
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <Link to="/support-tickets" className="w-full rounded-xl border border-border bg-surface py-3 text-center text-sm font-semibold">
            View my tickets
          </Link>
          <Link to="/profile" className="w-full rounded-xl bg-primary py-3 text-center text-sm font-semibold text-primary-foreground">
            Back to Profile
          </Link>
        </div>
      </div>
    );
  }

  const inputCls = "w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-primary";

  return (
    <div className="mx-auto max-w-md px-6 pt-10 pb-28">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate({ to: "/profile" })} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Profile
        </button>
        <span className="text-xs text-muted-foreground">Support</span>
      </div>

      <div className="mt-8 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <LifeBuoy className="h-6 w-6" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold">Submit Support Ticket</h1>
          <p className="text-sm text-muted-foreground">Report a bug, request a feature, or ask for help.</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-xs uppercase tracking-widest text-muted-foreground">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Your name" />
          </div>
          <div>
            <label className="mb-2 block text-xs uppercase tracking-widest text-muted-foreground">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="you@example.com" />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-xs uppercase tracking-widest text-muted-foreground">Ticket type</label>
          <select value={ticketType} onChange={(e) => setTicketType(e.target.value)} className={`${inputCls} appearance-none`}>
            {TICKET_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-xs uppercase tracking-widest text-muted-foreground">Subject</label>
          <input
            value={subject}
            onChange={(e) => { setSubject(e.target.value); if (errors.subject) setErrors((x) => ({ ...x, subject: undefined })); }}
            className={`${inputCls} ${errors.subject ? "border-destructive" : ""}`}
            placeholder="Reminder notification isn't working"
            maxLength={200}
          />
          {errors.subject && <p className="mt-1.5 text-xs text-destructive">{errors.subject}</p>}
        </div>

        <div>
          <label className="mb-2 block text-xs uppercase tracking-widest text-muted-foreground">Description</label>
          <textarea
            value={description}
            onChange={(e) => { setDescription(e.target.value); if (errors.description) setErrors((x) => ({ ...x, description: undefined })); }}
            rows={6}
            className={`${inputCls} resize-y ${errors.description ? "border-destructive" : ""}`}
            placeholder={"What happened?\nWhat did you expect?\nSteps to reproduce\nAnything else we should know?"}
            maxLength={5000}
          />
          {errors.description && <p className="mt-1.5 text-xs text-destructive">{errors.description}</p>}
        </div>

        <div>
          <label className="mb-2 block text-xs uppercase tracking-widest text-muted-foreground">Screenshot (optional)</label>
          {preview ? (
            <div className="relative overflow-hidden rounded-xl border border-border">
              <img src={preview} alt="Screenshot preview" className="max-h-56 w-full object-contain bg-background" />
              <button
                type="button"
                onClick={() => { pickFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
                aria-label="Remove screenshot"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface py-6 text-sm text-muted-foreground hover:border-primary hover:text-foreground"
            >
              <ImageUp className="h-5 w-5" /> Upload PNG, JPG, JPEG or WEBP
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          {errors.file && <p className="mt-1.5 text-xs text-destructive">{errors.file}</p>}
        </div>

        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:scale-[1.01] disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {busy ? "Submitting…" : "Submit Ticket"}
        </button>
        <p className="text-center text-xs text-muted-foreground">
          🎁 You’ll earn 3 bonus AI Mind Map credits for submitting.
        </p>
      </form>
    </div>
  );
}
