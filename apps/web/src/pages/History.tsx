import { useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useReports } from "../hooks/useReports";
import type { ReportSummary } from "../hooks/useReports";
import { usePreferences } from "../hooks/usePreferences";
import { Coachmarks } from "../components/Coachmarks";
import { useLanguage, useTopicLabel } from "../i18n/LanguageProvider";
import { capitalise } from "../lib/report-format";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

// Month grid as cells, Monday-first, with leading blanks (null).
function monthCells(year: number, month: number): (number | null)[] {
  const startIdx = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: startIdx }, () => null);
  for (let d = 1; d <= days; d++) cells.push(d);
  return cells;
}

function rowDateParts(date: string, locale: string) {
  const d = new Date(`${date}T00:00:00`);
  return {
    weekday: d.toLocaleDateString(locale, { weekday: "short" }),
    day: d.getDate(),
    month: d.toLocaleDateString(locale, { month: "short" }),
  };
}

export function History() {
  const { reports, loading } = useReports();
  const { prefs, markTipsSeen } = usePreferences();
  const navigate = useNavigate();
  const { t, locale } = useLanguage();

  const now = new Date();
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const todayStr = ymd(now.getFullYear(), now.getMonth(), now.getDate());
  const reportDates = new Set(reports.map((r) => r.date));

  // Reveal the full calendar above the sheet by measuring its height.
  const calRef = useRef<HTMLDivElement>(null);
  const [spacer, setSpacer] = useState(330);
  useLayoutEffect(() => {
    if (calRef.current) setSpacer(calRef.current.offsetHeight + 10);
  }, [view, loading]);

  const canNext =
    view.year < now.getFullYear() ||
    (view.year === now.getFullYear() && view.month < now.getMonth());

  function shiftMonth(delta: number) {
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  const monthLabel = capitalise(
    new Date(view.year, view.month, 1).toLocaleDateString(locale, { month: "long", year: "numeric" }),
  );

  return (
    <div className="relative h-full">
      {/* Calendar — fixed behind the sheet */}
      <div ref={calRef} className="absolute inset-x-0 top-0 px-5 pt-4">
        <h1 className="text-[26px] font-bold tracking-tight">{t.history.title}</h1>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-[15px] font-bold">{monthLabel}</span>
          <div className="flex items-center gap-4">
            <button onClick={() => shiftMonth(-1)} aria-label={t.history.prevMonth} className="text-[var(--ink)]">
              <Chevron dir="left" />
            </button>
            <button
              onClick={() => canNext && shiftMonth(1)}
              disabled={!canNext}
              aria-label={t.history.nextMonth}
              className={canNext ? "text-[var(--ink)]" : "text-[var(--faint)] opacity-40"}
            >
              <Chevron dir="right" />
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-7">
          {t.history.weekdays.map((d, i) => (
            <span key={i} className="text-center text-[10.5px] font-semibold text-[var(--faint)]">
              {d}
            </span>
          ))}
        </div>

        <div className="mt-1.5 grid grid-cols-7 gap-y-1" data-tour="history-calendar">
          {monthCells(view.year, view.month).map((day, i) => {
            if (day === null) return <span key={i} className="h-9" />;
            const dateStr = ymd(view.year, view.month, day);
            const hasReport = reportDates.has(dateStr);
            const isToday = dateStr === todayStr;
            return (
              <div key={i} className="flex h-9 items-center justify-center">
                <button
                  disabled={!hasReport}
                  onClick={() => navigate(`/report/${dateStr}`)}
                  className={dayClass(hasReport, isToday)}
                >
                  {day}
                </button>
              </div>
            );
          })}
        </div>

        <p className="mt-3 text-center text-[11.5px] text-[var(--faint)]">{t.history.tapDate}</p>
      </div>

      {/* Recent-reports sheet — scrolls up over the calendar */}
      <div className="absolute inset-0 overflow-y-auto">
        <div style={{ height: spacer }} />
        <div className="relative min-h-full rounded-t-[26px] bg-[var(--paper)] px-5 pb-6 shadow-[0_-12px_30px_-10px_rgba(45,32,20,0.16)]">
          <div className="sticky top-0 z-10 bg-[var(--paper)] pt-2.5">
            <div className="flex justify-center">
              <span className="h-1.5 w-9 rounded-full bg-[var(--line)]" />
            </div>
            <div className="flex items-baseline justify-between py-3">
              <span className="text-[11px] font-bold uppercase tracking-[1.2px] text-[var(--faint)]">
                {t.history.recent}
              </span>
              <span className="text-[12px] text-[var(--faint)]">{t.history.saved(reports.length)}</span>
            </div>
          </div>

          {loading ? (
            <p className="py-6 text-center text-[13px] text-[var(--faint)]">{t.common.loading}</p>
          ) : reports.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-[var(--muted)]">
              {t.history.empty}
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {reports.map((r, i) => (
                <ReportRow
                  key={r.id}
                  report={r}
                  tour={i === 0 ? "history-row" : undefined}
                  onOpen={() => navigate(`/report/${r.date}`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {prefs && !prefs.is_demo && (
        <Coachmarks
          seen={prefs.tips_seen ?? []}
          onSeen={markTipsSeen}
          tips={[
            {
              key: "history-calendar",
              target: '[data-tour="history-calendar"]',
              placement: "below", // sit under the calendar, pointing up
              title: t.history.tips.calendarTitle,
              body: t.history.tips.calendarBody,
            },
            {
              key: "history-list",
              target: '[data-tour="history-row"]',
              enabled: reports.length > 0,
              placement: "above", // sit above the cards (over the calendar), pointing down — never covers them
              title: t.history.tips.listTitle,
              body: t.history.tips.listBody,
            },
          ]}
        />
      )}
    </div>
  );
}

function dayClass(hasReport: boolean, isToday: boolean): string {
  const base = "flex h-[31px] w-[31px] items-center justify-center rounded-full text-[13px]";
  if (hasReport) {
    return `${base} bg-[var(--accent)] font-semibold text-[var(--on-accent)] ${
      isToday ? "ring-2 ring-[var(--accent)]/35 ring-offset-1 ring-offset-[var(--paper)]" : ""
    }`;
  }
  if (isToday) {
    return `${base} border border-[var(--accent)] font-semibold text-[var(--accent)]`;
  }
  return `${base} text-[var(--faint)]`;
}

function ReportRow({
  report,
  onOpen,
  tour,
}: {
  report: ReportSummary;
  onOpen: () => void;
  tour?: string;
}) {
  const { t, locale } = useLanguage();
  const topicLabel = useTopicLabel();
  const parts = rowDateParts(report.date, locale);
  return (
    <button
      onClick={onOpen}
      data-tour={tour}
      className={`flex items-center gap-3 rounded-2xl border border-[var(--line)] border-l-[3px] bg-[var(--surface)] p-3 text-left transition-opacity active:opacity-60 ${
        report.read ? "border-l-[var(--line)] opacity-70" : "border-l-[var(--accent)]"
      }`}
    >
      <div className="flex w-11 flex-none flex-col items-center">
        <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--faint)]">
          {parts.weekday}
        </span>
        <span className="text-[21px] font-bold leading-none">{parts.day}</span>
        <span className="text-[10px] text-[var(--faint)]">{parts.month}</span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 flex-none rounded-full bg-[var(--accent)]" />
          <span className="text-[13.5px] font-bold">
            {t.history.topics(report.topicCount)}
          </span>
          {report.read && <span className="text-[11px] text-[var(--faint)]">· {t.history.read}</span>}
        </div>
        {report.categories.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {report.categories.slice(0, 2).map((c) => (
              <span
                key={c}
                className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] text-[var(--muted)]"
              >
                {topicLabel(c)}
              </span>
            ))}
            {report.categories.length > 2 && (
              <span className="text-[11px] text-[var(--faint)]">+{report.categories.length - 2}</span>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-none items-center gap-2 text-[var(--faint)]">
        {report.hasPodcast && (
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--line)]">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 13 V11 a8 8 0 0 1 16 0 v2" />
              <rect x="3" y="13" width="4" height="7" rx="2" fill="currentColor" stroke="none" />
              <rect x="17" y="13" width="4" height="7" rx="2" fill="currentColor" stroke="none" />
            </svg>
          </span>
        )}
        <Chevron dir="right" />
      </div>
    </button>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === "left" ? "M14 6 L8 12 L14 18" : "M10 6 L16 12 L10 18"} />
    </svg>
  );
}
