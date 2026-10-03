import { usePlayer } from "../player/PlayerProvider";
import { formatTime } from "../lib/format-time";
import { PlayIcon, PauseIcon } from "./ui/icons";
import { useLanguage } from "../i18n/LanguageProvider";

// Docked above the bottom nav whenever something is loaded; persists across tabs.
export function MiniPlayer() {
  const { episode, isPlaying, currentTime, duration, toggle, expand } = usePlayer();
  const { t, locale } = useLanguage();
  if (!episode) return null;

  const pct = duration ? Math.min(100, (currentTime / duration) * 100) : 0;
  const d = new Date(`${episode.date}T00:00:00`);
  const mon = d.toLocaleDateString(locale, { month: "short" }).replace(".", "").toUpperCase();

  return (
    <div className="px-2.5 pb-1.5">
      <div className="relative flex items-center gap-3 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-2.5 shadow-[0_6px_18px_rgba(45,32,20,0.12)]">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-[var(--line)]">
          <div className="h-[3px] bg-[var(--accent)]" style={{ width: `${pct}%` }} />
        </div>

        <button onClick={expand} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={t.player.expand}>
          <span className="flex h-10 w-10 flex-none flex-col items-center justify-center rounded-lg bg-[var(--ink)] text-[var(--paper)]">
            <span className="text-[8px] font-bold opacity-70">{mon}</span>
            <span className="text-[15px] font-bold leading-none">{d.getDate()}</span>
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[14px] font-semibold">{t.player.title}</span>
            <span className="text-[12px] text-[var(--muted)]">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </span>
        </button>

        <button
          onClick={toggle}
          aria-label={isPlaying ? t.player.pause : t.player.play}
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[var(--accent)] text-[var(--on-accent)]"
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
      </div>
    </div>
  );
}
