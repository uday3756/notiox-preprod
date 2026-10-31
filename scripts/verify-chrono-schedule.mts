/**
 * Diverse dynamic-input verification for schedule chrono fallback.
 * Run: npx tsx scripts/verify-chrono-schedule.mts
 */
import { formatInTimeZone } from "date-fns-tz";
import { formatInTimeZone } from "date-fns-tz";
import {
  extractTimedTasksWithChrono,
  normalizeSpokenTimes,
  normalizeTranscriptForSchedule,
  isGarbageScheduleTitle,
} from "../src/lib/tasks/chrono-schedule-fallback.ts";

/** Saturday morning-ish UTC — weekend relative phrases resolve forward. */
const REF = "2026-07-25T06:30:00.000Z";
/** Coming Monday from REF in most zones (Sat → Mon). */
const EXPECT_MONDAY = "2026-07-27";

const ZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Asia/Dubai",
  "Asia/Singapore",
  "Australia/Sydney",
] as const;

type Case = {
  name: string;
  text: string;
  /** local HH:mm starts we must see (any order) */
  mustStart: string[];
  /** titles that must appear (substring match, case-insensitive) */
  mustTitle?: string[];
  /** titles that must NOT appear */
  mustNotTitle?: string[];
  /** all timed tasks must fall on this yyyy-MM-dd in the zone */
  mustYmd?: string;
  /** at least one of these title substrings (OR) */
  mustTitleAny?: string[];
};

const CASES: Case[] = [
  {
    name: "Indian dotted full day",
    text: "Tomorrow morning I have to wake up at 10 am and I have to go for breakfast. After that till 1.30 will be work and I have to give my dress to washing. After that 1.30 I will go for lunch till 2.30 and after that 2.30 to 5.30 I will go for gym. After that rest and 8.30 will be dinner timing for one hour.",
    mustStart: ["10:00", "13:30", "14:30", "20:30"],
    mustTitle: ["Morning", "Lunch", "Gym", "Dinner"],
    mustNotTitle: ["30"],
  },
  {
    name: "US am/pm meeting",
    text: "Tomorrow I have a meeting at 9 am and lunch at 12:30 pm. Then gym from 5 pm to 6 pm.",
    mustStart: ["09:00", "12:30", "17:00"],
    mustTitle: ["Meeting", "Lunch", "Gym"],
  },
  {
    name: "24h and range",
    text: "Tomorrow deep work 09:00 to 11:00 then call at 14:00.",
    mustStart: ["09:00", "14:00"],
  },
  {
    name: "half past + o'clock",
    text: "Tomorrow breakfast at 8 o'clock and coffee at half past 10.",
    mustStart: ["08:00", "10:30"],
  },
  {
    name: "military hrs",
    text: "Tomorrow flight at 1830 hrs and dinner at 2030 hrs.",
    mustStart: ["18:30", "20:30"],
    mustTitle: ["Flight", "Dinner"],
  },
  {
    name: "evening bare hour dinner",
    text: "Tomorrow evening dinner at 8 for one hour.",
    mustStart: ["20:00"],
    mustTitle: ["Dinner"],
  },
  {
    name: "doctor appointment am",
    text: "Tomorrow morning dentist appointment at 10:15 am.",
    mustStart: ["10:15"],
    mustTitle: ["Dentist"],
  },
  {
    name: "self-correction + vet + dinner clock",
    text: "tomorrow sorry day after tomorrow I have to take my dog to my vet and after that 8:30 pm I have to go with my girl for dinner",
    mustStart: ["10:00", "20:30"],
    mustTitle: ["Vet", "Dinner"],
  },
  {
    name: "meal defaults without clocks",
    text: "Tomorrow breakfast then lunch then a snack and dinner with family.",
    mustStart: ["08:00", "12:30", "16:00", "20:00"],
    mustTitle: ["Breakfast", "Lunch", "Snack", "Dinner"],
  },
  {
    name: "daypart only morning call",
    text: "Tomorrow morning I need to call my client.",
    mustStart: ["09:00"],
    mustTitle: ["Meeting"],
  },
  {
    name: "wedding weekend self-correction",
    // Anchor: Sat 2026-07-25 → Sunday after next = 2026-08-02
    text: "okay so next Saturday wait no next Sunday I mean the Sunday after this one my cousin's wedding. In the morning I need to pick up the rental suit. After that around 2.45 I have a quick Zoom for forty five minutes. Then at half past four I must go to the salon for a haircut. Sangeet starts at 7 pm lasting two hours. Also somewhere in the afternoon I should grab a snack because I will skip lunch. Night after the sangeet late dinner near the hotel. Oh and Monday morning I have to return the suit by 10 am sharp.",
    mustStart: ["14:45", "16:30", "19:00", "10:00", "09:00"],
    mustTitle: ["Zoom", "Salon", "Sangeet", "Return suit", "Pick up suit"],
    mustNotTitle: ["Lunch", "30"],
  },
  {
    name: "travel self-correction multi-day",
    text: "day after tomorrow I fly out wait actually tomorrow night sorry tomorrow evening my flight is at 21:10 to Singapore and I need to leave home three hours before that for the airport. Before leaving I still have to finish a client presentation so block deep work from 11:00 until 14:30 with a short break in between for lunch whenever. My Uber to the airport should be around six thirty pm. After I land the next morning local time I have a hotel check-in and then a coffee chat with Priya but she only said morning no exact time. Then at 1530 hrs I have a factory tour lasting ninety minutes. In the night I want dinner with the distributor team. Also remind me that the day I return which is Friday I have physiotherapy at 9 o'clock in the morning and then school pickup for my nephew at 3.",
    mustStart: ["21:10", "18:30", "11:00", "15:30", "09:00"],
    mustTitle: ["Flight", "Uber to airport", "Deep work", "Factory tour", "Physiotherapy"],
    mustNotTitle: ["Also remind me that the day I return which is", "30"],
  },
  {
    name: "messy interview day corrections",
    text: "tomorrow morning no wait today afternoon I already did breakfast so ignore breakfast. For tomorrow I meant day after tomorrow my interview is at 9:00 am with Acme Labs then after that I have to rush to submit paperwork at the notary till 11.30. Then from 12 to 1 I will take lunch with Rohan. After lunch till 2:15 I am free. At 2.15 I start a coding test for two hours. Then evening gym sorry not gym I cancelled gym I will go for a walk instead around 6. Later at 8 I have dinner with my sister but she said maybe 8.30 pm instead of 8 so use 8.30. Also I need to buy a birthday gift for mom sometime in the afternoon without a fixed time just put a flexible slot. Night I might have a snack while watching a movie. One more thing: next Wednesday I have a dentist at quarter past ten in the morning and the same Wednesday then a parent teacher meeting at 4 pm for one hour. Capture every distinct thing even if I corrected myself mid sentence.",
    mustStart: ["09:00", "12:00", "14:15", "18:00", "20:30", "10:15", "16:00", "15:00"],
    mustTitle: [
      "Interview",
      "Notary",
      "Lunch",
      "Coding test",
      "Walk",
      "Dinner",
      "Birthday gift",
      "Snack",
      "Dentist",
      "Parent teacher",
    ],
    mustNotTitle: ["Breakfast", "Gym", "30"],
  },
  {
    // Different activities/names than the interview sample — proves rules are not example-locked.
    name: "generic corrections different activities",
    text: "For tomorrow I meant day after tomorrow yoga at 7 am. Ignore coffee. Evening pilates sorry not pilates I cancelled pilates I will go for a swim instead around 5. Later at 7 I have dinner but she said maybe 7.45 pm instead of 7 so use 7.45. Next Thursday I have a haircut at quarter past two in the afternoon.",
    mustStart: ["07:00", "17:00", "19:45", "14:15"],
    mustTitle: ["Yoga", "Swim", "Dinner", "Salon"],
    mustNotTitle: ["Coffee", "Pilates", "30"],
  },
  {
    name: "this Monday fitting coaching class running",
    text: "this Monday I have plan fitting at morning 9:00 a.m. coaching for 2 hours after that 1:30 will be class start duffer that I have to go for running 6:00 p.m. this is coming Monday",
    mustStart: ["09:00", "13:30", "18:00"],
    mustTitle: ["Class", "Running"],
    mustTitleAny: ["Coaching", "Fitting"],
    mustNotTitle: ["Coaching that", "30"],
    mustYmd: EXPECT_MONDAY,
  },
  {
    name: "coming Tuesday studio alternate wording",
    text: "coming Tuesday morning studio session at 10 am for one hour then 2.15 seminar starts and jogging 7 pm",
    mustStart: ["10:00", "14:15", "19:00"],
    mustTitle: ["Running"],
    mustTitleAny: ["Class", "Studio", "Seminar"],
    mustYmd: "2026-07-28",
  },
  {
    name: "upcoming Monday wedding once",
    text: "upcoming Monday I have brother's wedding I have to visit morning 9:00 a.m.",
    mustStart: ["09:00"],
    mustTitle: ["Wedding"],
    mustYmd: EXPECT_MONDAY,
  },
  {
    name: "workout gym laundry messy day",
    text: "no I have to workout at 1:30 and I have to till 23 I have to go lunch and after that 3:00 p.m. I have to go for gym till 5 and after that coming and sleeping after 5:00 p.m. I have to go and give dress to washing machine for washing doctor 8 I have to take back my dress",
    mustStart: ["13:30", "15:00", "17:00", "12:30", "20:00"],
    mustTitle: ["Gym", "Lunch", "Laundry"],
    mustTitleAny: ["Collect laundry", "Laundry"],
    mustNotTitle: ["30"],
  },
];

// Sanity: STT + Monday unify
{
  const n = normalizeTranscriptForSchedule(
    "this Monday duffer that class start this is coming Monday",
  );
  if (!/\bafter\b/i.test(n) || !/\bthis coming monday\b/i.test(n)) {
    console.error("FAIL  normalizeTranscriptForSchedule Monday/STT — got:", n);
    process.exit(1);
  }
  if (!isGarbageScheduleTitle("Coaching that") || !isGarbageScheduleTitle("This Monday plan fitting coaching 2 hours")) {
    console.error("FAIL  garbage title filter");
    process.exit(1);
  }
}

function wall(iso: string, tz: string) {
  return formatInTimeZone(iso, tz, "HH:mm");
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

console.log("normalize sample:", normalizeSpokenTimes("1.30 half past 3 8 o'clock 1430 hrs"));
console.log("");

let fails = 0;
let checks = 0;

for (const tz of ZONES) {
  for (const c of CASES) {
    checks++;
    try {
      const tasks = extractTimedTasksWithChrono(c.text, tz, REF);
      const starts = tasks.map((t) => wall(t.start_time_iso, tz));
      for (const s of c.mustStart) {
        assert(starts.includes(s), `missing start ${s} (got ${starts.join(", ")})`);
      }
      for (const title of c.mustTitle ?? []) {
        assert(
          tasks.some((t) => t.title.toLowerCase().includes(title.toLowerCase())),
          `missing title ~${title} (got ${tasks.map((t) => t.title).join(", ")})`,
        );
      }
      for (const title of c.mustNotTitle ?? []) {
        assert(
          !tasks.some(
            (t) =>
              t.title === title ||
              t.title.trim() === title ||
              t.title.toLowerCase() === title.toLowerCase(),
          ),
          `forbidden title ${title}`,
        );
      }
      if (c.mustTitleAny?.length) {
        assert(
          c.mustTitleAny.some((title) =>
            tasks.some((t) => t.title.toLowerCase().includes(title.toLowerCase())),
          ),
          `missing any of ~${c.mustTitleAny.join("|")} (got ${tasks.map((t) => t.title).join(", ")})`,
        );
      }
      if (c.mustYmd) {
        for (const t of tasks) {
          const ymd = formatInTimeZone(t.start_time_iso, tz, "yyyy-MM-dd");
          assert(
            ymd === c.mustYmd,
            `expected day ${c.mustYmd} for ${t.title}, got ${ymd}`,
          );
        }
      }
      assert(!tasks.some((t) => /^\d+$/.test(t.title)), "numeric garbage title");
      assert(
        !tasks.some((t) => isGarbageScheduleTitle(t.title)),
        `garbage title slipped through (got ${tasks.map((t) => t.title).join(", ")})`,
      );
    } catch (e) {
      fails++;
      console.error(`FAIL  ${tz} :: ${c.name} — ${(e as Error).message}`);
    }
  }
}

const passed = checks - fails;
console.log(`\n${passed}/${checks} checks passed across ${ZONES.length} zones × ${CASES.length} input styles.`);
if (fails) process.exit(1);
console.log("OK — dynamic input styles look good for all dropdown timezones.");
