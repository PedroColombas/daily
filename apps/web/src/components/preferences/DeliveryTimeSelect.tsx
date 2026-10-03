import { utcHourToLocal, localHourToUtc, formatLocalHour } from "../../lib/delivery-time";
import { useLanguage } from "../../i18n/LanguageProvider";

// Native hour picker (renders as an iOS wheel), showing the user's local times. Value in/out
// is the stored UTC delivery hour; conversion happens here.
export function DeliveryTimeSelect({
  valueUtc,
  onChange,
}: {
  valueUtc: number;
  onChange: (utcHour: number) => void;
}) {
  const { t, locale } = useLanguage();
  return (
    <select
      value={utcHourToLocal(valueUtc)}
      onChange={(e) => onChange(localHourToUtc(Number(e.target.value)))}
      aria-label={t.delivery.aria}
      className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[14px] font-semibold text-[var(--ink)] outline-none focus:border-[var(--accent)]"
    >
      {Array.from({ length: 24 }, (_, h) => (
        <option key={h} value={h}>
          {formatLocalHour(h, locale)}
        </option>
      ))}
    </select>
  );
}
