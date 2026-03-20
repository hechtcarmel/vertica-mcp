export interface SubclusterSchedule {
  daysOfWeek: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  startMinute: number; // minutes since midnight, inclusive (e.g. 480 = 08:00)
  endMinute: number; // minutes since midnight, exclusive (e.g. 1080 = 18:00)
  timezone: string; // IANA timezone, e.g. "Europe/Berlin"
}

const DAY_NAMES: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

/**
 * Parse a schedule string into a SubclusterSchedule.
 * Format: "MON-FRI 08:00-18:00"
 */
export function parseSchedule(
  scheduleStr: string,
  timezone: string
): SubclusterSchedule {
  const parts = scheduleStr.trim().split(/\s+/);
  if (parts.length !== 2) {
    throw new Error(
      `Invalid schedule format: "${scheduleStr}". Expected "MON-FRI 08:00-18:00"`
    );
  }

  const [dayPart, hourPart] = parts as [string, string];

  // Parse day range
  let daysOfWeek: number[];
  if (dayPart.includes("-")) {
    const [startDayStr, endDayStr] = dayPart.split("-");
    const startDay = DAY_NAMES[(startDayStr ?? "").toUpperCase()];
    const endDay = DAY_NAMES[(endDayStr ?? "").toUpperCase()];
    if (startDay === undefined || endDay === undefined) {
      throw new Error(
        `Invalid day names in schedule: "${dayPart}". Use SUN/MON/TUE/WED/THU/FRI/SAT`
      );
    }
    daysOfWeek = [];
    for (let i = startDay; i <= endDay; i++) daysOfWeek.push(i);
  } else {
    const dayIdx = DAY_NAMES[dayPart.toUpperCase()];
    if (dayIdx === undefined) {
      throw new Error(
        `Invalid day name in schedule: "${dayPart}". Use SUN/MON/TUE/WED/THU/FRI/SAT`
      );
    }
    daysOfWeek = [dayIdx];
  }

  // Parse time range (HH:MM-HH:MM)
  const [startTimeStr, endTimeStr] = hourPart.split("-");
  const [startH, startM] = (startTimeStr ?? "").split(":").map(Number);
  const [endH, endM] = (endTimeStr ?? "").split(":").map(Number);

  if (isNaN(startH!) || isNaN(startM!) || isNaN(endH!) || isNaN(endM!)) {
    throw new Error(
      `Invalid time range in schedule: "${hourPart}". Expected "HH:MM-HH:MM"`
    );
  }

  return {
    daysOfWeek,
    startMinute: startH! * 60 + startM!,
    endMinute: endH! * 60 + endM!,
    timezone,
  };
}

/**
 * Check if the current moment falls within the given schedule.
 * `now` can be injected for testing; defaults to new Date().
 */
export function isWithinSchedule(
  schedule: SubclusterSchedule,
  now: Date = new Date()
): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: schedule.timezone,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);

  const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const minuteStr = parts.find((p) => p.type === "minute")?.value ?? "0";

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const weekday = weekdayMap[weekdayStr];
  if (weekday === undefined) return false;

  const hour = parseInt(hourStr, 10) % 24; // "24" can appear for midnight in some locales
  const minute = parseInt(minuteStr, 10);
  const currentMinute = hour * 60 + minute;

  return (
    schedule.daysOfWeek.includes(weekday) &&
    currentMinute >= schedule.startMinute &&
    currentMinute < schedule.endMinute
  );
}
