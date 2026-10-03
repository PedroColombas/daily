// delivery_hour is stored as a whole hour in UTC (the cron matches it directly). The UI works
// in the user's local whole hours, so we convert on read/write. Using a whole-hour offset keeps
// the two conversions exact inverses (stable round-trip) even in half-hour timezones, where the
// actual delivery lands within ~30 min of the chosen hour.
//
// Note: the stored hour is fixed UTC, so across a DST change the local delivery time shifts by an
// hour. Acceptable at hour granularity; revisit (store tz + local hour) if that ever matters.

function offsetHours(): number {
  // getTimezoneOffset is (UTC - local) in minutes; round to whole hours.
  return Math.round(new Date().getTimezoneOffset() / 60);
}

export function utcHourToLocal(utc: number): number {
  return (((utc - offsetHours()) % 24) + 24) % 24;
}

export function localHourToUtc(local: number): number {
  return (((local + offsetHours()) % 24) + 24) % 24;
}

// Format a local whole hour (0–23) as a friendly local time, e.g. "7:00 AM" or "7:00", in the app's
// language (see LanguageProvider's locale).
export function formatLocalHour(localHour: number, locale?: string): string {
  const d = new Date();
  d.setHours(localHour, 0, 0, 0);
  return d.toLocaleTimeString(locale ? [locale] : [], { hour: "numeric", minute: "2-digit" });
}

// Format a stored UTC delivery hour directly as the user's local time (for copy).
export function formatDeliveryHour(utc: number, locale?: string): string {
  return formatLocalHour(utcHourToLocal(utc), locale);
}
