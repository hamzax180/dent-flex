"use client";

import { useEffect, useRef, useState } from "react";
import { SiteImage } from "./site-image";

type Phase = "black" | "name" | "reveal" | "done";

const SEEN_KEY = "df_intro_seen";

/**
 * Hero background "film": black screen → DENT FLEX in white → the clinic slowly lights up.
 * The clinic is a real-time 3D render (lazy-loaded). Plays in full once per session; reduced-motion
 * visitors and devices without WebGL get the finished state immediately.
 * Sets <html data-hero="..."> so the hero copy and header can fade in after the intro (see globals.css).
 */
export function HeroFilm() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("black");
  const [failed, setFailed] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* storage unavailable: play the full intro */
    }
    const lowPower = window.innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) <= 4;
    let scene: { reveal: (ms?: number) => void; dispose: () => void } | null = null;
    let cancelled = false;
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    const finish = () => {
      setPhase("done");
      root.dataset.hero = "done";
    };

    root.dataset.hero = "playing";
    // Safety net: never hold the page hostage, even if WebGL or fonts stall.
    at(9000, finish);

    (async () => {
      try {
        await document.fonts?.ready;
        const { createClinicScene } = await import("./clinic-scene");
        if (cancelled || !canvasRef.current) return;
        scene = createClinicScene(canvasRef.current, { lowPower, still: reduced });
      } catch {
        setFailed(true);
      }
      if (cancelled) return;

      if (reduced) {
        finish();
        return;
      }
      if (seen) {
        // Returning in the same session: skip the title card, quick reveal.
        setPhase("reveal");
        scene?.reveal(2200);
        at(700, finish);
        return;
      }
      at(350, () => setPhase("name"));
      at(3100, () => {
        setPhase("reveal");
        scene?.reveal(6500);
      });
      at(4600, finish);
    })();

    return () => {
      cancelled = true;
      timers.current.forEach(clearTimeout);
      timers.current = [];
      scene?.dispose();
      delete root.dataset.hero;
    };
  }, []);

  const skip = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPhase("done");
    document.documentElement.dataset.hero = "done";
  };

  const showName = phase === "name";
  const lit = phase === "reveal" || phase === "done";

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden bg-black" aria-hidden={phase === "done" ? undefined : true}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="A calm, sunlit dental treatment room"
        className={`absolute inset-0 h-full w-full transition-opacity duration-[1800ms] ${failed ? "opacity-0" : "opacity-100"}`}
      />
      {failed && <SiteImage name="treatment-room" sizes="100vw" priority className="absolute inset-0" />}

      {/* Readability wash for the hero copy; fades in with the clinic */}
      <div
        className={`absolute inset-0 bg-gradient-to-t from-forest/90 via-forest/45 to-forest/20 transition-opacity duration-[2500ms] md:bg-gradient-to-r md:from-forest/85 md:via-forest/35 md:to-transparent ${lit ? "opacity-100" : "opacity-0"}`}
      />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_180px_rgba(0,0,0,0.55)]" />

      {/* Title card */}
      <div
        className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-black transition-opacity ease-out ${
          phase === "black" || showName ? "opacity-100 duration-300" : "opacity-0 duration-[2200ms]"
        }`}
      >
        <p
          className={`display text-center text-5xl text-white transition-all duration-[1600ms] ease-out sm:text-7xl md:text-8xl ${
            showName ? "tracking-[0.28em] opacity-100 blur-0" : "tracking-[0.6em] opacity-0 blur-sm"
          }`}
        >
          DENT&nbsp;FLEX
        </p>
        <p className={`eyebrow mt-6 text-[0.7rem] text-white/70 transition-opacity delay-700 duration-1000 sm:text-xs ${showName ? "opacity-100" : "opacity-0"}`}>
          Dental Clinic · Istanbul
        </p>
      </div>

      {phase !== "done" && (
        <button
          type="button"
          onClick={skip}
          className="pointer-events-auto absolute bottom-24 right-4 z-10 border border-white/30 px-4 py-2 text-xs uppercase tracking-[0.16em] text-white/80 hover:bg-white/10 sm:bottom-6 sm:right-6"
        >
          Skip intro
        </button>
      )}

    </div>
  );
}
