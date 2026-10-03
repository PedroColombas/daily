import { useState } from "react";
import type { ReportRecap } from "@shared/types";
import { useT } from "../i18n/LanguageProvider";

// "While you were away" card — shown above the brief when the reader missed days. Collapsed to a
// few lines by default: fully open it dominates the screen and pulls attention off the brief
// itself, which is the thing they actually came for. Tap to read the rest.
export function RecapCard({ recap }: { recap: ReportRecap }) {
  const [open, setOpen] = useState(false);
  const t = useT();

  return (
    <button
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      className="w-full rounded-2xl border border-[var(--line)] border-l-[3px] border-l-[var(--accent)] bg-[var(--surface)] p-4 text-left"
    >
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[1.2px] text-[var(--accent)]">
          {t.recap.title}
        </span>
        <span className="text-[11px] text-[var(--faint)]">· {t.recap.days(recap.days)}</span>
      </div>

      <p
        className={`mt-2 whitespace-pre-line text-[14px] leading-relaxed text-[var(--ink)]/85 ${
          open ? "" : "line-clamp-3"
        }`}
      >
        {recap.summary}
      </p>

      <span className="mt-2 inline-block text-[12.5px] font-semibold text-[var(--accent)]">
        {open ? t.recap.less : t.recap.more}
      </span>
    </button>
  );
}
