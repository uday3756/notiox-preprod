import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AnalyticsDashboard } from "@/components/notio/analytics-dashboard";
import { computeAdaptiveInsights } from "@/lib/adaptive-learning.functions";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { data: insights, isLoading } = useQuery({
    queryKey: ["adaptive-insights"],
    queryFn: async () => await computeAdaptiveInsights(),
  });

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <h1 className="font-display text-2xl font-bold">Insights</h1>
          <p className="text-sm text-muted-foreground">
            Your productivity patterns & smart recommendations
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <AnalyticsDashboard insights={insights ?? null} isLoading={isLoading} />
      </div>
    </div>
  );
}


