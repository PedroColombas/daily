import type { User } from "@supabase/supabase-js";

// "2026-06-27" -> "Saturday · 27 June", or "sábado · 27 de junio" (parsed as local, not UTC
// midnight). `locale` is the app's (LanguageProvider), so dates match the interface language.
export function formatReportDate(date: string, locale?: string): string {
  const d = new Date(`${date}T00:00:00`);
  const weekday = d.toLocaleDateString(locale, { weekday: "long" });
  const rest = d.toLocaleDateString(locale, { day: "numeric", month: "long" });
  return `${weekday} · ${rest}`;
}

// The same date for use inside a sentence: "2026-06-27" -> "Saturday 27 June".
export function formatReportDateInline(date: string, locale?: string): string {
  return formatReportDate(date, locale).replace(" · ", " ");
}

// "sábado" -> "Sábado", for where a date stands alone as a title. Spanish lower-cases weekdays and
// months mid-sentence, so this is applied at the point of display, never in the formatter.
export function capitalise(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

export function greeting(
  words: { morning: string; afternoon: string; evening: string },
  now: Date = new Date(),
): string {
  const h = now.getHours();
  if (h < 12) return words.morning;
  if (h < 18) return words.afternoon;
  return words.evening;
}

// First name from auth metadata, else the email's leading segment, title-cased.
export function displayName(user: User | null): string {
  const full = user?.user_metadata?.full_name;
  if (typeof full === "string" && full.trim()) return full.trim().split(" ")[0];
  const local = (user?.email ?? "").split("@")[0].split(/[._-]/)[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "";
}

export function estimateReadMinutes(texts: string[]): number {
  const words = texts.reduce((n, t) => n + t.trim().split(/\s+/).filter(Boolean).length, 0);
  return Math.max(1, Math.round(words / 200));
}

// Readable host for a source URL, e.g. "https://www.reuters.com/x" -> "reuters.com".
export function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// A clean one-line preview of a section's write-up (strips light markdown, truncates).
export function snippet(summary: string, max = 180): string {
  const text = summary
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [text](url) -> text
    .replace(/[#*_>`]/g, "") // emphasis / heading marks
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}
