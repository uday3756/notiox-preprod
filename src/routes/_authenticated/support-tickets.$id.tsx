import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NotioLogo } from "@/components/notio/logo";
import { ticketTypeLabel, statusLabel, statusPillClass, type SupportTicket } from "@/lib/support";

export const Route = createFileRoute("/_authenticated/support-tickets/$id")({
  component: TicketDetailsPage,
});

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function TicketDetailsPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const prev = useRef<{ status: string; reply: string | null } | null>(null);

  const { data: ticket, isLoading } = useQuery({
    queryKey: ["ticket", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("id, ticket_id, ticket_type, subject, body, screenshot_url, status, admin_reply, created_at, updated_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as SupportTicket) ?? null;
    },
  });

  // In-app notifications: toast when the admin replies or the status changes.
  useEffect(() => {
    if (!ticket) return;
    const p = prev.current;
    if (p) {
      if (ticket.status !== p.status) {
        toast(`Ticket status: ${statusLabel(ticket.status)}`);
      } else if ((ticket.admin_reply ?? "") !== (p.reply ?? "") && ticket.admin_reply) {
        toast("Support replied to your ticket");
      }
    }
    prev.current = { status: ticket.status, reply: ticket.admin_reply };
  }, [ticket]);

  // Realtime updates for this ticket (RLS keeps it to the owner).
  useEffect(() => {
    const ch = supabase
      .channel(`ticket-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "support_tickets", filter: `id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["ticket", id] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [id, qc]);

  return (
    <div className="mx-auto max-w-md px-6 pt-10 pb-28">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate({ to: "/support-tickets" })} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> My tickets
        </button>
        <NotioLogo className="text-lg" />
      </div>

      {isLoading ? (
        <div className="py-16 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : !ticket ? (
        <div className="mt-10 rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="text-sm text-muted-foreground">Ticket not found.</p>
          <Link to="/support-tickets" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">Back to my tickets</Link>
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          <div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">{ticket.ticket_id}</span>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusPillClass(ticket.status)}`}>
                {statusLabel(ticket.status)}
              </span>
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold leading-tight">{ticket.subject}</h1>
            <p className="mt-1 text-xs text-muted-foreground">{ticketTypeLabel(ticket.ticket_type ?? "other")}</p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Description</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{ticket.body}</p>
          </div>

          {ticket.screenshot_url && (
            <a href={ticket.screenshot_url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-2xl border border-border">
              <img src={ticket.screenshot_url} alt="Attached screenshot" className="max-h-72 w-full object-contain bg-background" />
            </a>
          )}

          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Admin reply</p>
            </div>
            {ticket.admin_reply ? (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{ticket.admin_reply}</p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No reply yet. We’ll update you here as soon as the team responds.</p>
            )}
          </div>

          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Created {fmt(ticket.created_at)}</span>
            <span>Updated {fmt(ticket.updated_at)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
