
import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { usesAmPmClock } from "@/lib/time-format";

function formatConfirmTime(d: Date, timezone?: string | null): string {
  const tz =
    timezone?.trim() ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "UTC";
  const pat = usesAmPmClock(tz) ? "MMM d, h:mm a" : "MMM d, HH:mm";
  return formatInTimeZone(d, tz, pat);
}
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TimeExtractionResult } from "@/lib/scheduling.functions";

interface ScheduleConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extractionResult: TimeExtractionResult | null;
  onConfirm: (
    result: TimeExtractionResult,
    adjustments?: { startTime?: string; endTime?: string }
  ) => Promise<void>;
  isLoading?: boolean;
  /** Account IANA timezone for display (falls back to device zone). */
  timezone?: string | null;
  constraint?: {
    status: "valid" | "conflict" | "outside_hours";
    violations: string[];
    suggestions?: { earliest_valid_slot?: string; alternative_dates?: string[] };
  };
}

const CATEGORY_COLORS: Record<string, string> = {
  meeting: "bg-blue-100 text-blue-800",
  deadline: "bg-red-100 text-red-800",
  standup: "bg-purple-100 text-purple-800",
  presentation: "bg-orange-100 text-orange-800",
  "deep-work": "bg-green-100 text-green-800",
  break: "bg-yellow-100 text-yellow-800",
  lunch: "bg-amber-100 text-amber-800",
  admin: "bg-gray-100 text-gray-800",
  planning: "bg-indigo-100 text-indigo-800",
  exercise: "bg-pink-100 text-pink-800",
  personal: "bg-violet-100 text-violet-800",
};

function ConfidenceBar({ confidence }: { confidence: number }) {
  const percentage = confidence * 100;
  let colorClass = "";

  if (percentage >= 80) {
    colorClass = "bg-green-500";
  } else if (percentage >= 60) {
    colorClass = "bg-yellow-500";
  } else {
    colorClass = "bg-red-500";
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Confidence</span>
        <span className="text-sm font-medium">{percentage.toFixed(0)}%</span>
      </div>
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${colorClass} transition-all`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export function ScheduleConfirmationDialog({
  open,
  onOpenChange,
  extractionResult,
  onConfirm,
  isLoading = false,
  timezone,
  constraint,
}: ScheduleConfirmationDialogProps) {
  const displayTz =
    timezone?.trim() ||
    extractionResult?.timezone_assumed?.trim() ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "UTC";
  const [selectedFallback, setSelectedFallback] = useState<string | null>(null);
  const [adjustedResult, setAdjustedResult] = useState<TimeExtractionResult | null>(
    null
  );

  if (!extractionResult) {
    return null;
  }

  const result = adjustedResult || extractionResult;
  const hasLowConfidence = result.confidence < 0.8;
  const hasFallbacks = result.fallback_times && result.fallback_times.length > 0;
  const hasConflict = constraint?.status !== "valid";

  const startTime = result.start_time_iso ? parseISO(result.start_time_iso) : null;
  const endTime = result.end_time_iso ? parseISO(result.end_time_iso) : null;

  const handleConfirm = async () => {
    try {
      await onConfirm(adjustedResult || extractionResult);
      setSelectedFallback(null);
      setAdjustedResult(null);
      onOpenChange(false);
    } catch (error) {
      console.error("Error confirming schedule:", error);
    }
  };

  const handleUseFallback = (fallbackTime: string) => {
    if (!extractionResult) return;

    const fallbackDate = parseISO(fallbackTime);
    const duration = extractionResult.estimated_duration_minutes;
    const endDate = new Date(fallbackDate.getTime() + duration * 60000);

    setAdjustedResult({
      ...extractionResult,
      start_time_iso: fallbackDate.toISOString(),
      end_time_iso: endDate.toISOString(),
      interpretation: `${extractionResult.interpretation} [Adjusted to ${formatConfirmTime(fallbackDate, displayTz)}]`,
    });
    setSelectedFallback(fallbackTime);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Confirm Your Task</DialogTitle>
          <DialogDescription>
            Review the extracted task details below
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Title & Category */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">{result.title}</h3>
            <Badge className={CATEGORY_COLORS[result.category] || ""}>
              {result.category}
            </Badge>
          </div>

          {/* Time Information */}
          {result.is_timebound && (startTime || endTime) && (
            <div className="p-3 bg-blue-50 rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium">Scheduled for:</span>
              </div>
              {startTime && (
                <div className="text-sm text-gray-700">
                  <strong>Start:</strong> {formatConfirmTime(startTime, displayTz)}
                </div>
              )}
              {endTime && (
                <div className="text-sm text-gray-700">
                  <strong>End:</strong> {formatConfirmTime(endTime, displayTz)}
                </div>
              )}
              <div className="text-sm text-gray-700">
                <strong>Duration:</strong> {result.estimated_duration_minutes}{" "}
                minutes
              </div>
            </div>
          )}

          {/* Confidence Indicator */}
          <ConfidenceBar confidence={result.confidence} />

          {/* Interpretation */}
          <div className="text-sm text-gray-600 p-2 bg-gray-50 rounded">
            {result.interpretation}
          </div>

          {/* Low Confidence - Show Alternatives */}
          {hasLowConfidence && hasFallbacks && (
            <div className="p-3 border border-yellow-200 bg-yellow-50 rounded-lg space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-900">Low confidence</p>
                  <p className="text-sm text-yellow-800">
                    Could you clarify the timing? Here are suggestions:
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {result.fallback_times!.map((fallback, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleUseFallback(fallback.time)}
                    className={`w-full p-2 text-left rounded border transition-colors ${
                      selectedFallback === fallback.time
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="text-sm font-medium">
                      {formatConfirmTime(parseISO(fallback.time), displayTz)}
                    </div>
                    <div className="text-xs text-gray-600">
                      {fallback.reason}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Constraint Violations */}
          {hasConflict && constraint?.violations && (
            <div className="p-3 border border-red-200 bg-red-50 rounded-lg space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-900">
                    {constraint.status === "outside_hours"
                      ? "Outside working hours"
                      : "Scheduling conflict"}
                  </p>
                  <ul className="text-sm text-red-800 mt-1 space-y-1">
                    {constraint.violations.map((v, idx) => (
                      <li key={idx}>• {v}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {constraint.suggestions?.earliest_valid_slot && (
                <button
                  onClick={() =>
                    handleUseFallback(constraint.suggestions!.earliest_valid_slot!)
                  }
                  className="w-full mt-2 p-2 text-sm font-medium text-center rounded bg-red-100 hover:bg-red-200 text-red-900 transition-colors"
                >
                  ✓ Reschedule to next available time
                </button>
              )}
            </div>
          )}

          {/* Valid confirmation */}
          {!hasConflict && (
            <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-green-900">
                Ready to schedule
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              isLoading || (hasLowConfidence && !selectedFallback && hasFallbacks)
            }
            className="gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Scheduling...
              </>
            ) : (
              "Schedule It"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
