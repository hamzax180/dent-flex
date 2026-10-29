"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  as?: "div" | "ul";
  className?: string;
  /** Classes for the dot indicator row (e.g. "sm:hidden" so dots only show where it slides). */
  dotsClassName?: string;
  /** Time each slide rests, ms. */
  interval?: number;
  /** Glide duration, ms — deliberately slow. */
  glide?: number;
  tone?: "light" | "dark";
  label: string;
  children: React.ReactNode;
};

const slidesOf = (row: HTMLElement) => Array.from(row.children) as HTMLElement[];
/** scrollLeft that aligns slide i with the row's left padding. */
function offsetOf(row: HTMLElement, i: number) {
  const pad = parseFloat(getComputedStyle(row).paddingLeft) || 0;
  return Math.max(0, Math.min(row.scrollWidth - row.clientWidth, slidesOf(row)[i].offsetLeft - row.offsetLeft - pad));
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Horizontal swipe row that, on narrow screens, advances slowly by itself like a slideshow.
 * - Only runs when the row actually overflows (phones); wider layouts stay a static grid.
 * - Pauses while touched/hovered/focused, when off-screen or the tab is hidden; resumes after a rest.
 * - Disabled entirely for prefers-reduced-motion.
 */
export function SlideRow({ as = "div", className = "", dotsClassName = "", interval = 4200, glide = 1400, tone = "light", label, children }: Props) {
  const ref = useRef<HTMLDivElement & HTMLUListElement>(null);
  const [count, setCount] = useState(0);
  const [index, setIndexState] = useState(0);
  const indexRef = useRef(0);
  const setIndex = useCallback((i: number) => {
    indexRef.current = i;
    setIndexState(i);
  }, []);
  const pausedUntil = useRef(0);
  const visible = useRef(false);
  const animating = useRef(false);


  /** Slow, eased glide (native smooth scrolling is too quick for a slideshow feel). */
  const glideTo = useCallback(
    (i: number) => {
      const row = ref.current;
      if (!row || !slidesOf(row)[i]) return;
      const from = row.scrollLeft;
      const to = offsetOf(row, i);
      if (Math.abs(to - from) < 2) return setIndex(i);
      animating.current = true;
      const snap = row.style.scrollSnapType;
      row.style.scrollSnapType = "none"; // snapping would fight the animation
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / glide);
        row.scrollLeft = from + (to - from) * easeInOut(p);
        if (p < 1) requestAnimationFrame(step);
        else {
          row.style.scrollSnapType = snap;
          animating.current = false;
        }
      };
      requestAnimationFrame(step);
      setIndex(i);
    },
    [glide, setIndex],
  );

  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    setCount(row.children.length);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Track the slide the user is looking at (manual swipes update the dots).
    const onScroll = () => {
      if (animating.current) return;
      const items = slidesOf(row);
      let best = 0;
      let bestDist = Infinity;
      items.forEach((_, i) => {
        const d = Math.abs(offsetOf(row, i) - row.scrollLeft);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      setIndex(best);
    };
    const hold = (ms = 7000) => () => (pausedUntil.current = Date.now() + ms);
    const onTouch = hold();
    const onEnter = hold(60_000);
    const onLeave = hold(1500);
    row.addEventListener("scroll", onScroll, { passive: true });
    row.addEventListener("pointerdown", onTouch, { passive: true });
    row.addEventListener("touchstart", onTouch, { passive: true });
    row.addEventListener("wheel", onTouch, { passive: true });
    row.addEventListener("focusin", onEnter);
    row.addEventListener("focusout", onLeave);
    row.addEventListener("mouseenter", onEnter);
    row.addEventListener("mouseleave", onLeave);

    const io = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting), { threshold: 0.5 });
    io.observe(row);

    const timer = reduced
      ? 0
      : window.setInterval(() => {
          const r = ref.current;
          if (!r || !visible.current || document.hidden || animating.current || Date.now() < pausedUntil.current) return;
          if (r.scrollWidth - r.clientWidth < 8) return; // not sliding at this width
          const atEnd = r.scrollLeft >= r.scrollWidth - r.clientWidth - 4;
          glideTo(atEnd ? 0 : (indexRef.current + 1) % r.children.length);
        }, interval);

    return () => {
      window.clearInterval(timer);
      io.disconnect();
      row.removeEventListener("scroll", onScroll);
      row.removeEventListener("pointerdown", onTouch);
      row.removeEventListener("touchstart", onTouch);
      row.removeEventListener("wheel", onTouch);
      row.removeEventListener("focusin", onEnter);
      row.removeEventListener("focusout", onLeave);
      row.removeEventListener("mouseenter", onEnter);
      row.removeEventListener("mouseleave", onLeave);
    };
  }, [glideTo, interval, setIndex]);

  const Tag = as;
  return (
    <>
      <Tag ref={ref} className={className} aria-roledescription="carousel" aria-label={label}>
        {children}
      </Tag>
      {count > 1 && (
        <div className={`mt-5 flex justify-center gap-2 ${dotsClassName}`} role="group" aria-label={`${label} — slides`}>
          {Array.from({ length: count }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Slide ${i + 1} of ${count}`}
              aria-current={i === index}
              onClick={() => {
                pausedUntil.current = Date.now() + 9000;
                glideTo(i);
              }}
              className={`h-1.5 transition-all duration-500 ${i === index ? "w-6" : "w-1.5"} ${
                tone === "dark" ? (i === index ? "bg-sage" : "bg-ivory/30") : i === index ? "bg-forest" : "bg-forest/25"
              }`}
            />
          ))}
        </div>
      )}
    </>
  );
}
