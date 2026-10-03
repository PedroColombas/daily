import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n/LanguageProvider";

export interface Tip {
  key: string; // stable id, stored in tips_seen so it shows only once
  target: string; // querySelector for the element the bubble points at
  title: string;
  body: string;
  enabled?: boolean; // default true; false = not applicable right now → deferred to a later visit
  placement?: "above" | "below"; // preferred side; falls back if that side has no room
}

const BUBBLE_MAX = 340;
const MARGIN = 12; // min gap from the viewport edges
const GAP = 12; // gap between the target and the bubble
const MIN_ROOM = 130; // space (px) needed to honour a placement preference before falling back

// Contextual coach-marks: a speech bubble that points at a real on-screen element, shown one tip at
// a time. It's an ADDITION to the live page, not a modal — the layer is click-through so the user can
// keep scrolling and tapping; the bubble travels with its target (and hides when it scrolls out of
// view). Following a scroll is done IMPERATIVELY (rAF-throttled, writing only a composited transform)
// so it stays smooth. Tips are page-local and conditional — a tip whose target isn't present (or whose
// `enabled` is false) is skipped now and gets its turn on a later visit. Portaled to <body>.
export function Coachmarks({
  tips,
  seen,
  onSeen,
}: {
  tips: Tip[];
  seen: string[];
  onSeen: (keys: string[]) => void;
}) {
  const words = useT();
  // Freeze the batch at mount: the tips eligible right now (applicable + not yet seen). Pages remount
  // on each tab visit, so a tip that only becomes eligible later still gets shown then.
  const [batch] = useState<Tip[]>(() =>
    tips.filter((t) => t.enabled !== false && !seen.includes(t.key)),
  );
  const [idx, setIdx] = useState(0);
  const [side, setSide] = useState<"above" | "below" | null>(null); // null until the target is located

  const bubbleRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLDivElement>(null);
  const dims = useRef({ w: 0, h: 0, tail: -1 }); // cached bubble size so scroll never re-reads it

  const tip = idx < batch.length ? batch[idx] : null;
  const tipRef = useRef(tip);
  tipRef.current = tip;
  const sideRef = useRef<"above" | "below">("below");

  // Reposition imperatively (no React re-render). Reads the target rect + cached bubble size and
  // writes only `transform` (composited) — never a layout property — so a scroll stays smooth.
  const follow = useCallback(() => {
    const t = tipRef.current;
    const bubble = bubbleRef.current;
    if (!t || !bubble) return;
    const el = document.querySelector(t.target);
    if (!el) {
      bubble.style.visibility = "hidden";
      return;
    }
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (r.bottom < 8 || r.top > vh - 8) {
      bubble.style.visibility = "hidden"; // target scrolled out of view — let the bubble go with it
      return;
    }
    const { w, h } = dims.current;
    const anchorTop = Math.max(r.top, MARGIN);
    const anchorBottom = Math.min(r.bottom, vh - MARGIN);
    let y = sideRef.current === "below" ? anchorBottom + GAP : anchorTop - GAP - h;
    y = Math.min(Math.max(y, MARGIN), vh - MARGIN - h);
    const targetCx = r.left + r.width / 2;
    const centerX = Math.min(Math.max(targetCx, MARGIN + w / 2), vw - MARGIN - w / 2);
    const x = centerX - w / 2;
    bubble.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    bubble.style.visibility = "visible";
    const tl = Math.min(Math.max(targetCx - x, 18), w - 18);
    if (tailRef.current && tl !== dims.current.tail) {
      tailRef.current.style.left = `${tl}px`;
      dims.current.tail = tl;
    }
  }, []);

  // (Re)measure the bubble (width is viewport-derived, height follows content), then place it.
  const layout = useCallback(() => {
    const bubble = bubbleRef.current;
    if (!bubble) return;
    const w = Math.min(window.innerWidth - MARGIN * 2, BUBBLE_MAX);
    bubble.style.width = `${w}px`;
    dims.current.w = w;
    dims.current.h = bubble.offsetHeight;
    dims.current.tail = -1; // force a tail reposition
    follow();
  }, [follow]);

  // When the tip changes: locate its target, choose a side, then reveal the bubble.
  useLayoutEffect(() => {
    setSide(null);
    if (!tip) return;
    let raf = 0;
    let tries = 0;
    const decide = () => {
      const el = document.querySelector(tip.target);
      if (el) {
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight;
        const roomBelow = vh - Math.min(r.bottom, vh - MARGIN);
        const roomAbove = Math.max(r.top, MARGIN);
        const autoBelow = roomBelow >= roomAbove;
        let below = autoBelow;
        if (tip.placement === "below") below = roomBelow >= MIN_ROOM || autoBelow;
        else if (tip.placement === "above") below = roomAbove >= MIN_ROOM ? false : autoBelow;
        sideRef.current = below ? "below" : "above";
        setSide(below ? "below" : "above");
        return;
      }
      if (tries++ < 12) raf = requestAnimationFrame(decide);
      else setIdx((n) => n + 1); // give up on a missing target
    };
    decide();
    return () => cancelAnimationFrame(raf);
  }, [tip]);

  // Once the bubble is on the page (side set), place it and keep it pinned to the target.
  useLayoutEffect(() => {
    if (side === null) return;
    layout();
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        follow();
      });
    };
    window.addEventListener("scroll", onScroll, true); // capture → catches inner scroll containers too
    window.addEventListener("resize", layout);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", layout);
    };
  }, [side, layout, follow]);

  const advance = useCallback(() => {
    const t = tipRef.current;
    if (t) onSeen([t.key]);
    setSide(null);
    setIdx((n) => n + 1);
  }, [onSeen]);

  const skip = useCallback(() => {
    const remaining = batch.slice(idx).map((t) => t.key);
    if (remaining.length) onSeen(remaining);
    setSide(null);
    setIdx(batch.length);
  }, [batch, idx, onSeen]);

  if (!tip || side === null) return null;
  const last = idx === batch.length - 1;

  return createPortal(
    // Click-through layer — the page underneath stays scrollable/tappable; only the bubble catches taps.
    // The bubble carries no React-managed positioning styles; transform/width/visibility are set
    // imperatively in layout()/follow() and survive re-renders (React only manages declared style keys).
    <div className="pointer-events-none fixed inset-0 z-[70]">
      <div
        ref={bubbleRef}
        className="pointer-events-auto absolute left-0 top-0 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_16px_40px_-12px_rgba(20,14,8,0.5)]"
      >
        {/* tail — a rotated square straddling the bubble edge, pointing at the target */}
        <div
          ref={tailRef}
          className={`absolute h-3 w-3 rotate-45 border-[var(--line)] bg-[var(--surface)] ${
            side === "below" ? "-top-1.5 border-l border-t" : "-bottom-1.5 border-b border-r"
          }`}
          style={{ marginLeft: -6 }}
        />
        <h3 className="text-[16px] font-bold tracking-tight">{tip.title}</h3>
        <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--muted)]">{tip.body}</p>

        <div className="mt-3.5 flex items-center justify-between">
          <div className="flex gap-1.5">
            {batch.map((_, n) => (
              <span
                key={n}
                className={`h-1.5 w-1.5 rounded-full ${n === idx ? "bg-[var(--accent)]" : "bg-[var(--line)]"}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-3">
            {!last && (
              <button onClick={skip} className="text-[13px] font-medium text-[var(--faint)]">
                {words.coach.skip}
              </button>
            )}
            <button
              onClick={advance}
              className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-[13px] font-semibold text-[var(--on-accent)] active:opacity-80"
            >
              {last ? words.coach.done : words.coach.next}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
