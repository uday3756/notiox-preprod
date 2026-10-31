import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus, ChevronRight, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NotioLogo } from "@/components/notio/logo";
import { ticketTypeLabel, statusLabel, statusPillClass, type SupportTicket } from "@/lib/support";

export const Route = createFileRoute("/_authenticated/support-tickets/")({
  component: MyTicketsPage,
});

function MyTicketsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["my-tickets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("id, ticket_id, ticket_type, subject, body, screenshot_url, status, admin_reply, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SupportTicket[];
    },
  });

  // Realtime: reflect admin replies / status changes as they happen. RLS scopes
  // the stream to the user's own rows.
  useEffect(() => {
    const ch = supabase
      .channel("my-tickets")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => {
        qc.invalidateQueries({ queryKey: ["my-tickets"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc]);

  return (
    <div className="mx-auto max-w-md px-6 pt-10 pb-28">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate({ to: "/profile" })} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Profile
        </button>
        <NotioLogo className="text-lg" />
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">My Support Tickets</h1>
        <Link to="/support" className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
          <Plus className="h-4 w-4" /> New
        </Link>
      </div>

      <div className="mt-6 space-y-3">
        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          </div>
        ) : !tickets?.length ? (
          <div className="rounded-2xl border border-border bg-surface py-12 text-center">
            <Inbox className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">You haven’t submitted any tickets yet.</p>
            <Link to="/support" className="mt-4 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              Submit a ticket
            </Link>
          </div>
        ) : (
          tickets.map((t) => (
            <Link
              key={t.id}
              to="/support-tickets/$id"
              params={{ id: t.id }}
              className="block rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-primary/50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.subject}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t.ticket_id} · {ticketTypeLabel(t.ticket_type ?? "other")}
                  </p>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusPillClass(t.status)}`}>
                  {statusLabel(t.status)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(t.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
