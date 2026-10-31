"use client";

import { useEffect, useState } from "react";
import {
  TrendingUp,
  Clock,
  Target,
  Zap,
  Coffee,
  Loader2,
  Award,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { AdaptiveInsights } from "@/lib/adaptive-learning.functions";

interface AnalyticsDashboardProps {
  insights: AdaptiveInsights | null;
  isLoading?: boolean;
}

const ENERGY_COLORS: Record<string, string> = {
  high: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-red-100 text-red-800",
};

function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
  color = "text-blue-600",
}: {
  icon: typeof Target;
  label: string;
  value: string;
  sublabel?: string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className={`${color}`}>
            <Icon className="h-8 w-8" />
          </div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
            {sublabel && (
              <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HourHeatmap({
  bestHours,
  worstHours,
}: {
  bestHours: number[];
  worstHours: number[];
}) {
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const getHourClass = (hour: number) => {
    if (bestHours.includes(hour)) return "bg-green-500 text-white";
    if (worstHours.includes(hour)) return "bg-red-400 text-white";
    return "bg-gray-100 text-gray-500";
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-12 gap-1">
        {hours.map((hour) => (
          <div
            key={hour}
            className={`aspect-square rounded flex items-center justify-center text-xs font-medium ${getHourClass(hour)}`}
            title={`${hour}:00`}
          >
            {hour}
          </div>
        ))}
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-green-500 inline-block" /> Peak
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-red-400 inline-block" /> Low energy
        </span>
      </div>
    </div>
  );
}

export function AnalyticsDashboard({
  insights,
  isLoading = false,
}: AnalyticsDashboardProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!insights || insights.totalCompleted === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-lg font-medium">No data yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Complete a few tasks and your productivity insights will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Target}
          label="Completion Rate"
          value={`${insights.completionRate}%`}
          color="text-green-600"
        />
        <StatCard
          icon={Clock}
          label="Time Accuracy"
          value={`${Math.round(insights.estimationAccuracy * 100)}%`}
          sublabel={
            insights.estimationAccuracy > 1.1
              ? `You take ${Math.round((insights.estimationAccuracy - 1) * 100)}% longer than planned`
              : "Estimates are on point"
          }
          color="text-blue-600"
        />
        <StatCard
          icon={Award}
          label="Tasks Done"
          value={`${insights.totalCompleted}`}
          sublabel="Last 90 days"
          color="text-purple-600"
        />
        <StatCard
          icon={Zap}
          label="Energy Level"
          value={insights.energyLevel.toUpperCase()}
          color={
            insights.energyLevel === "high"
              ? "text-green-600"
              : insights.energyLevel === "medium"
                ? "text-yellow-600"
                : "text-red-600"
          }
        />
      </div>

      {/* Productivity heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Your Productivity by Hour
          </CardTitle>
          <CardDescription>
            When you complete tasks most effectively
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HourHeatmap
            bestHours={insights.bestHours}
            worstHours={insights.worstHours}
          />
          {insights.bestHours.length > 0 && (
            <p className="text-sm text-muted-foreground mt-4">
              💡 Schedule your most important work around{" "}
              <strong>
                {insights.bestHours.map((h) => `${h}:00`).join(", ")}
              </strong>{" "}
              when you're most productive.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Category accuracy */}
      {Object.keys(insights.categoryAccuracy).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Time Estimation by Category</CardTitle>
            <CardDescription>
              How accurate your estimates are per task type
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(insights.categoryAccuracy).map(
              ([category, ratio]) => {
                const percent = Math.min(100, (1 / ratio) * 100);
                return (
                  <div key={category}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="capitalize font-medium">{category}</span>
                      <span className="text-muted-foreground">
                        {ratio > 1.1
                          ? `${Math.round((ratio - 1) * 100)}% over`
                          : ratio < 0.9
                            ? `${Math.round((1 - ratio) * 100)}% under`
                            : "Accurate"}
                      </span>
                    </div>
                    <Progress value={percent} className="h-2" />
                  </div>
                );
              }
            )}
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      {insights.paddingRecommendations.length > 0 && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              Smart Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {insights.paddingRecommendations.map((rec, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 bg-white rounded-lg border"
              >
                <Badge variant="secondary" className="capitalize">
                  {rec.category}
                </Badge>
                <span className="text-sm">
                  Add{" "}
                  <strong>{Math.round((rec.multiplier - 1) * 100)}% buffer</strong>{" "}
                  — we'll auto-pad your time estimates
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Smart breaks */}
      {insights.recommendedBreaks.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coffee className="h-5 w-5 text-amber-600" />
              Suggested Breaks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {insights.recommendedBreaks.map((brk, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 bg-white rounded-lg border"
              >
                <Badge variant="outline">{brk.time}</Badge>
                <span className="text-sm text-muted-foreground">
                  {brk.reason}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
