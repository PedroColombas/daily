import { MAX_INTERESTS } from "../../lib/preferences-options";
import { useT } from "../../i18n/LanguageProvider";

export function CustomInterestsEditor({
  interests,
  onChange,
  atCap = false,
}: {
  interests: string[];
  onChange: (next: string[]) => void;
  atCap?: boolean; // at the total topic cap — no more topics of any kind
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2">
      {interests.map((interest, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={interest}
            onChange={(e) => {
              const next = [...interests];
              next[i] = e.target.value;
              onChange(next);
            }}
            placeholder={t.topics.placeholder}
            className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2.5 text-[14px] outline-none placeholder:text-[var(--faint)] focus:border-[var(--accent)]"
          />
          <button
            type="button"
            aria-label={t.topics.removeInterestAria}
            onClick={() => onChange(interests.filter((_, j) => j !== i))}
            className="flex-none rounded-xl border border-[var(--line)] px-3 py-2.5 text-[var(--faint)]"
          >
            ✕
          </button>
        </div>
      ))}
      {interests.length < MAX_INTERESTS && !atCap && (
        <button
          type="button"
          onClick={() => onChange([...interests, ""])}
          className="self-start text-[13.5px] font-semibold text-[var(--accent)]"
        >
          {t.topics.addInterest}
        </button>
      )}
    </div>
  );
}
