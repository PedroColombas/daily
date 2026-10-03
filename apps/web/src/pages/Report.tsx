import { Fragment, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import type { ReportSection, ReportSource } from "@shared/types";
import { useReport } from "../hooks/useReport";
import { useAuth } from "../auth/AuthProvider";
import { markReportRead } from "../lib/reads";
import { formatReportDate, sourceHost } from "../lib/report-format";
import { useLanguage, useTopicLabel } from "../i18n/LanguageProvider";

// Body text sizes (S / M / L), cycled by the "Aa" control and remembered.
const TEXT_SIZES = ["text-[15px]", "text-[16.5px]", "text-[18px]"];

const markdownComponents: Components = {
  p: ({ children }) => (
    <p className="mb-3 hyphens-auto text-justify leading-relaxed text-[var(--ink)]/85">{children}</p>
  ),
  strong: ({ children }) => <strong className="font-semibold text-[var(--ink)]">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="mb-3 ml-4 list-disc space-y-1.5">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 ml-4 list-decimal space-y-1.5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed text-[var(--ink)]/85">{children}</li>,
  h1: ({ children }) => <h3 className="mb-1.5 mt-4 text-[15px] font-bold">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-1.5 mt-4 text-[15px] font-bold">{children}</h3>,
  h3: ({ children }) => <h3 className="mb-1.5 mt-4 text-[15px] font-bold">{children}</h3>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-[var(--accent)] underline">
      {children}
    </a>
  ),
};

export function Report() {
  const { date } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { report, loading } = useReport(date);
  const { t, locale } = useLanguage();

  // Opening the reading view marks the report read.
  useEffect(() => {
    if (user && report?.status === "complete") void markReportRead(user.id, report.id);
  }, [user, report?.id, report?.status]);

  const [sizeIdx, setSizeIdx] = useState(() => {
    const v = Number(localStorage.getItem("reader-size"));
    return Number.isInteger(v) && v >= 0 && v < TEXT_SIZES.length ? v : 0;
  });

  function cycleSize() {
    const next = (sizeIdx + 1) % TEXT_SIZES.length;
    setSizeIdx(next);
    localStorage.setItem("reader-size", String(next));
  }

  async function share() {
    if (!report?.markdown) return;
    const payload = { title: `Daily — ${formatReportDate(report.date, locale)}`, text: report.markdown };
    try {
      if (navigator.share) await navigator.share(payload);
      else await navigator.clipboard.writeText(report.markdown);
    } catch {
      /* user dismissed the share sheet */
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-md flex-col">
      <div className="flex flex-none items-center justify-between border-b border-[var(--line)] bg-[var(--paper)]/95 px-3 py-2.5 backdrop-blur">
        <button
          onClick={() => navigate(-1)}
          aria-label={t.report.back}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--ink)]"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={cycleSize}
            aria-label={t.report.textSize}
            className="flex h-9 items-center justify-center rounded-full px-3 text-[var(--ink)]"
          >
            <span className="text-[13px] font-bold">A</span>
            <span className="text-[16px] font-bold">a</span>
          </button>
          {report?.markdown && (
            <button
              onClick={() => void share()}
              aria-label={t.report.share}
              className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--ink)]"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
                <path d="M12 16V3" />
                <path d="M8 7l4-4 4 4" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <Centered>{t.common.loading}</Centered>
      ) : !report ? (
        <Centered>{t.report.notFound}</Centered>
      ) : report.status !== "complete" || !report.content ? (
        <Centered>{t.report.notReady}</Centered>
      ) : (
        <Article
          date={report.date}
          sections={report.content.sections}
          bodySize={TEXT_SIZES[sizeIdx]}
        />
      )}
    </div>
  );
}

function Article({
  date,
  sections,
  bodySize,
}: {
  date: string;
  sections: ReportSection[];
  bodySize: string;
}) {
  const { t, locale } = useLanguage();
  // Scroll to the section the user tapped on Today (e.g. /report/2026-06-27#s2).
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) el.scrollIntoView({ block: "start" });
  }, []);

  return (
    <div className="flex-1 overflow-y-auto px-6 pb-16 pt-5">
      <span className="text-[12px] font-semibold uppercase tracking-[1.8px] text-[var(--muted)]">
        {formatReportDate(date, locale)}
      </span>
      <h1 className="mt-1.5 text-[26px] font-bold leading-tight tracking-tight">{t.report.title}</h1>
      <span className="mt-1.5 block text-[13px] text-[var(--muted)]">{t.report.topics(sections.length)}</span>

      <div className="mt-4 flex flex-col gap-7">
        {sections.map((s, i) => (
          <Fragment key={i}>
            {i > 0 && <SectionDivider />}
            <Section id={`s${i}`} section={s} bodySize={bodySize} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function Section({
  id,
  section,
  bodySize,
}: {
  id: string;
  section: ReportSection;
  bodySize: string;
}) {
  const [showSources, setShowSources] = useState(false);
  const { t } = useLanguage();
  const topicLabel = useTopicLabel();
  return (
    <div id={id} className="scroll-mt-20">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 flex-none rounded-full bg-[var(--accent)]" />
        <span className="text-[11.5px] font-semibold uppercase tracking-[1.4px] text-[var(--muted)]">
          {section.category ? topicLabel(section.category) : t.today.forYou}
        </span>
        {section.isPrimer && (
          <span className="rounded-full bg-[var(--accent)]/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--accent)]">
            {t.today.newTopic}
          </span>
        )}
      </div>
      <h2 className="mt-2 text-[22px] font-bold leading-tight tracking-tight">{section.topic}</h2>

      <div className={`mt-3 ${bodySize}`}>
        <ReactMarkdown components={markdownComponents}>{section.summary}</ReactMarkdown>
      </div>

      {section.sources.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowSources((v) => !v)}
            className="text-[12.5px] font-semibold text-[var(--accent)]"
          >
            {t.report.sources(section.sources.length)}
            <span className="ml-1 text-[var(--faint)]">{showSources ? "▲" : "▾"}</span>
          </button>
          {showSources && <SourceList sources={section.sources} />}
        </div>
      )}
    </div>
  );
}

// Topic separator: a hairline with a centred accent dot (per the reading-view wireframe).
function SectionDivider() {
  return (
    <div className="flex items-center gap-3" aria-hidden>
      <span className="h-px flex-1 bg-[var(--line)]" />
      <span className="h-[5px] w-[5px] rounded-full bg-[var(--accent)]" />
      <span className="h-px flex-1 bg-[var(--line)]" />
    </div>
  );
}

function SourceList({ sources }: { sources: ReportSource[] }) {
  return (
    <ul className="mt-3 flex flex-col gap-2.5">
      {sources.map((s, i) => (
        <li key={i}>
          <a href={s.url} target="_blank" rel="noreferrer" className="flex flex-col">
            <span className="text-[13px] font-medium leading-snug text-[var(--ink)] underline-offset-2 hover:underline">
              {s.title ?? sourceHost(s.url)}
            </span>
            <span className="text-[11.5px] text-[var(--faint)]">
              {sourceHost(s.url)}
              {s.date ? ` · ${s.date}` : ""}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 text-center text-[14px] text-[var(--muted)]">
      {children}
    </div>
  );
}
