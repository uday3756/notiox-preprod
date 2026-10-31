import { format, parseISO } from "date-fns";

type ReportIdentity = {
  id: string;
  week_start: string;
  week_end: string;
  created_at: string;
};

/** Presentation-only selection; preserve the server's order and stored records. */
export function selectDisplayReports<T extends ReportIdentity>(reports: readonly T[]): T[] {
  const ids = new Set<string>();
  const periods = new Map<string, T>();
  for (const report of reports) {
    if (ids.has(report.id)) continue;
    ids.add(report.id);
    const period = `${report.week_start}/${report.week_end}`;
    const previous = periods.get(period);
    if (!previous || Date.parse(report.created_at) > Date.parse(previous.created_at)) {
      periods.set(period, report);
    }
  }
  return [...periods.values()];
}

export function formatReportRange(start: string, end: string): string {
  const startDate = parseISO(start);
  const endDate = parseISO(end);
  const startFormat = startDate.getFullYear() === endDate.getFullYear() ? "MMM d" : "MMM d, yyyy";
  return `${format(startDate, startFormat)} - ${format(endDate, "MMM d, yyyy")}`;
}
