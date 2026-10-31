"use client";

import { Clock } from "lucide-react";
import { Card } from "@/components/ui/card";

export interface HoursPreset {
  id: string;
  label: string;
  description: string;
  start: string;
  end: string;
}

export const HOURS_PRESETS: HoursPreset[] = [
  {
    id: "standard",
    label: "Standard (9–5)",
    description: "Classic business hours",
    start: "09:00",
    end: "17:00",
  },
  {
    id: "early-bird",
    label: "Early Bird (5 AM–12 PM)",
    description: "Morning-focused schedule",
    start: "05:00",
    end: "12:00",
  },
  {
    id: "late-start",
    label: "Late Start (11 AM–7 PM)",
    description: "For night owls",
    start: "11:00",
    end: "19:00",
  },
  {
    id: "extended",
    label: "Extended (8 AM–8 PM)",
    description: "Long working day",
    start: "08:00",
    end: "20:00",
  },
  {
    id: "part-time",
    label: "Part-time (10 AM–2 PM)",
    description: "Short focused window",
    start: "10:00",
    end: "14:00",
  },
  {
    id: "night-shift",
    label: "Night Shift (10 PM–6 AM)",
    description: "Overnight schedule",
    start: "22:00",
    end: "06:00",
  },
];

interface HoursPresetsProps {
  selectedId?: string;
  onSelect: (preset: HoursPreset) => void;
}

export function HoursPresets({ selectedId, onSelect }: HoursPresetsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {HOURS_PRESETS.map((preset) => (
        <Card
          key={preset.id}
          onClick={() => onSelect(preset)}
          className={`cursor-pointer p-4 transition-colors hover:border-primary/50 ${
            selectedId === preset.id
              ? "border-primary bg-primary/5"
              : "border-border"
          }`}
        >
          <div className="flex items-start gap-3">
            <Clock
              className={`h-5 w-5 mt-0.5 ${
                selectedId === preset.id
                  ? "text-primary"
                  : "text-muted-foreground"
              }`}
            />
            <div>
              <p className="font-medium text-sm">{preset.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {preset.description}
              </p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
