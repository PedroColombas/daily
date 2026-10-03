import { useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { usePlayer } from "../player/PlayerProvider";
import type { PlayerEpisode } from "../player/PlayerProvider";
import { formatTime } from "../lib/format-time";
import { PlayIcon, PauseIcon } from "./ui/icons";
import { useLanguage } from "../i18n/LanguageProvider";
import { capitalise } from "../lib/report-format";

// Full-screen player. Slides up from the bottom when expanded; swipe down (or the chevron)
// to dismiss. The sheet itself is the PlayerSheet child, mounted only while expanded so its
// hooks/state reset cleanly on close.
export function FullPlayer() {
  const { episode, expanded } = usePlayer();
  return (
    <AnimatePresence>
      {expanded && episode ? <PlayerSheet episode={episode} /> : null}
    </AnimatePresence>
  );
}

function PlayerSheet({ episode }: { episode: PlayerEpisode }) {
  const { isPlaying, currentTime, duration, rate, toggle, seek, skip, setRate, collapse } =
    usePlayer();
  const { t, locale } = useLanguage();

  const [showSpeed, setShowSpeed] = useState(false);
  const speedDrag = useRef<{ x: number; rate: number } | null>(null);
  // Sheet drag is started only from the grab handle (dragListener=false), so it can't conflict
  // with the scrubber's click or the speed pill's pointer-capture lower down.
  const dragControls = useDragControls();

  const pct = duration ? Math.min(100, (currentTime / duration) * 100) : 0;
  const remaining = Math.max(0, duration - currentTime);
  const frac = duration ? Math.min(1, currentTime / duration) : 0;
  // Active chapter = the last one whose start the playhead has passed (chapters are sorted).
  const activeChapter = episode.chapters.reduce((acc, ch, i) => (frac >= ch.fraction ? i : acc), 0);
  const currentChapterTitle = episode.chapters[activeChapter]?.title;
  const d = new Date(`${episode.date}T00:00:00`);
  const weekday = capitalise(d.toLocaleDateString(locale, { weekday: "long" }));
  const dayMonth = d.toLocaleDateString(locale, { day: "numeric", month: "long" });
  const minutes = Math.max(1, Math.round((duration || episode.durationSeconds || 0) / 60));

  function onScrub(e: MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - r.left) / r.width;
    seek(Math.max(0, Math.min(1, frac)) * duration);
  }

  // Press the pill, hold, and slide horizontally to set the rate (~220px = full 0.5–1.5 sweep).
  function onSpeedPointerDown(e: PointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    speedDrag.current = { x: e.clientX, rate };
    setShowSpeed(true);
  }
  function onSpeedPointerMove(e: PointerEvent<HTMLButtonElement>) {
    if (!speedDrag.current) return;
    const raw = speedDrag.current.rate + (e.clientX - speedDrag.current.x) / 220;
    setRate(Math.max(0.5, Math.min(1.5, Math.round(raw * 10) / 10)));
  }
  function onSpeedPointerUp(e: PointerEvent<HTMLButtonElement>) {
    speedDrag.current = null;
    setShowSpeed(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* capture may already be released */
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-[var(--paper)] text-[var(--ink)]"
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 34, stiffness: 330 }}
      drag="y"
      dragControls={dragControls}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.9 }}
      onDragEnd={(_, info) => {
        if (info.offset.y > 120 || info.velocity.y > 600) collapse();
      }}
    >
      <div className="mx-auto flex h-full max-w-md flex-col px-6 pb-10 pt-2">
        {/* Grab handle — drag down to dismiss */}
        <div
          onPointerDown={(e) => dragControls.start(e)}
          className="flex flex-none touch-none cursor-grab justify-center py-2 active:cursor-grabbing"
        >
          <span className="h-1 w-9 rounded-full bg-[var(--line)]" />
        </div>

        {/* Top bar */}
        <div className="flex flex-none items-center justify-between">
          <button onClick={collapse} aria-label={t.player.collapse} className="flex h-9 w-9 items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9.5 L12 15.5 L18 9.5" />
            </svg>
          </button>
          <span className="text-[11.5px] font-semibold uppercase tracking-[1.8px] text-[var(--muted)]">
            {t.player.nowPlaying}
          </span>
          <span className="h-9 w-9" />
        </div>

        {/* Typographic cover */}
        <div className="mt-3 flex aspect-square w-full flex-col justify-between rounded-3xl bg-[var(--ink)] p-6 text-[var(--paper)] shadow-[0_16px_34px_-12px_rgba(45,32,20,0.5)]">
          <span className="text-[11.5px] font-semibold uppercase tracking-[2px] text-[var(--accent)]">
            {t.player.cover}
          </span>
          <div className="text-[33px] font-bold leading-[1.03] tracking-tight">
            {weekday}
            <br />
            {dayMonth}
          </div>
          <div className="flex h-7 items-end gap-[3px]">
            {[40, 70, 100, 55, 85, 35, 60, 45, 75, 50].map((h, i) => (
              <span
                key={i}
                className="w-[3px] rounded-sm"
                style={{ height: `${h}%`, background: i === 2 ? "var(--accent)" : "rgba(250,248,244,0.45)" }}
              />
            ))}
          </div>
        </div>

        {/* Title + meta */}
        <div className="mt-5 flex-none">
          <div className="text-[19px] font-bold tracking-tight">{t.player.title}</div>
          <div className="text-[13px] text-[var(--muted)]">{t.player.meta(minutes)}</div>
        </div>

        {/* Current section + segmented scrubber */}
        <div className="mt-5 flex-none">
          {currentChapterTitle && (
            <div className="mb-2 flex items-center gap-2">
              <span className="h-1.5 w-1.5 flex-none rounded-full bg-[var(--accent)]" />
              <span className="truncate text-[13px] font-semibold">{currentChapterTitle}</span>
            </div>
          )}
          <div onClick={onScrub} className="relative h-1.5 cursor-pointer rounded-full bg-[var(--line)]">
            <div className="absolute left-0 top-0 h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
            {/* Section splits */}
            {episode.chapters.map((ch, i) =>
              i > 0 && ch.fraction > 0 && ch.fraction < 1 ? (
                <span
                  key={i}
                  className="absolute top-0 h-full w-[2px] bg-[var(--paper)]"
                  style={{ left: `${ch.fraction * 100}%` }}
                />
              ) : null,
            )}
            <div
              className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-[var(--accent)] shadow"
              style={{ left: `calc(${pct}% - 7px)` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[12px] text-[var(--faint)]">
            <span>{formatTime(currentTime)}</span>
            <span>-{formatTime(remaining)}</span>
          </div>
        </div>

        {/* Transport */}
        <div className="mt-6 flex flex-none items-center justify-center gap-9">
          <SkipButton dir="back" onClick={() => skip(-15)} />
          <button
            onClick={toggle}
            aria-label={isPlaying ? t.player.pause : t.player.play}
            className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-[var(--accent)] text-[var(--on-accent)] shadow-[0_6px_16px_rgba(192,81,43,0.4)]"
          >
            {isPlaying ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
          </button>
          <SkipButton dir="fwd" onClick={() => skip(15)} />
        </div>

        {/* Speed — press, hold, and slide the pill */}
        <div className="relative mt-6 flex flex-none items-center justify-center">
          {showSpeed && (
            <div className="absolute bottom-full z-20 mb-3 w-60 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_10px_30px_-10px_rgba(45,32,20,0.3)]">
              <div className="mb-2 text-center text-[15px] font-bold">{rate.toFixed(1)}×</div>
              <div className="flex items-center gap-2 text-[11px] text-[var(--faint)]">
                <span>0.5×</span>
                <div className="relative h-1.5 flex-1 rounded-full bg-[var(--line)]">
                  <div
                    className="absolute left-0 top-0 h-full rounded-full bg-[var(--accent)]"
                    style={{ width: `${((rate - 0.5) / 1) * 100}%` }}
                  />
                  <div
                    className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-[var(--accent)] shadow"
                    style={{ left: `calc(${((rate - 0.5) / 1) * 100}% - 7px)` }}
                  />
                </div>
                <span>1.5×</span>
              </div>
            </div>
          )}
          <button
            onPointerDown={onSpeedPointerDown}
            onPointerMove={onSpeedPointerMove}
            onPointerUp={onSpeedPointerUp}
            onPointerCancel={onSpeedPointerUp}
            className="relative z-20 touch-none select-none rounded-full border border-[var(--line)] px-4 py-1.5 text-[13px] font-semibold"
          >
            {rate.toFixed(1)}×
          </button>
        </div>

        <div className="flex-1" />
      </div>
    </motion.div>
  );
}

function SkipButton({ dir, onClick }: { dir: "back" | "fwd"; onClick: () => void }) {
  const t = useLanguage().t;
  return (
    <button
      onClick={onClick}
      aria-label={dir === "back" ? t.player.back15 : t.player.forward15}
      className="relative flex h-12 w-12 items-center justify-center text-[var(--ink)]"
    >
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {dir === "back" ? (
          <>
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </>
        ) : (
          <>
            <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </>
        )}
      </svg>
      <span className="absolute text-[9px] font-bold">15</span>
    </button>
  );
}
