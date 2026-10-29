"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { IMAGES } from "./site-image";

type Phase = "black" | "name" | "reveal" | "done";

const SEEN_KEY = "df_intro_seen";
/** The rooms the camera drifts through, in order. */
const SLIDES = ["treatment-room", "reception", "consultation"] as const;
const SLIDE_MS = 8000;

/**
 * Hero background "film": black screen → DENT FLEX in white → the clinic slowly comes up out of the dark,
 * then the camera drifts through the rooms (slow Ken Burns + cross-fades), with a soft sunlight sweep and fine grain.
 * Plays the title card once per session; reduced-motion visitors get a still photo straight away.
 * Sets <html data-hero="..."> so the hero copy and header can fade in after the intro (see globals.css).
 */
export function HeroFilm() {
  const [phase, setPhase] = useState<Phase>("black");
  const [slide, setSlide] = useState(0);
  const [still, setStill] = useState(false);
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
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    const finish = () => {
      setPhase("done");
      root.dataset.hero = "done";
    };

    if (reduced) {
      setStill(true);
      finish();
      return;
    }
    root.dataset.hero = "playing";
    if (seen) {
      setPhase("reveal");
      at(600, finish);
    } else {
      at(350, () => setPhase("name"));
      at(3100, () => setPhase("reveal"));
      at(4600, finish);
    }
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      delete root.dataset.hero;
    };
  }, []);

  // Advance the rooms once the clinic is revealed.
  const lit = phase === "reveal" || phase === "done";
  useEffect(() => {
    if (!lit || still) return;
    const id = window.setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), SLIDE_MS);
    return () => window.clearInterval(id);
  }, [lit, still]);

  const skip = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPhase("done");
    document.documentElement.dataset.hero = "done";
  };

  const showName = phase === "name";

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden bg-black" aria-hidden={phase === "done" ? undefined : true}>
      {/* The rooms: each one drifts while it's on screen, then cross-fades to the next */}
      <div className={`absolute inset-0 transition-[opacity,filter] duration-[3200ms] ease-out ${lit ? "opacity-100 brightness-100" : "opacity-0 brightness-[0.25]"}`}>
        {SLIDES.map((name, i) => {
          const on = i === slide;
          return (
            <div
              key={name}
              className={`absolute inset-0 transition-opacity duration-[2600ms] ease-in-out ${on ? "opacity-100" : "opacity-0"}`}
            >
              <Image
                src={IMAGES[name].src}
                alt={i === 0 ? IMAGES[name].alt : ""}
                fill
                sizes="100vw"
                priority={i === 0}
                placeholder="blur"
                quality={90}
                className={`object-cover ${still ? "" : `df-kb df-kb--${i + 1}`} ${on && !still ? "df-kb--run" : ""}`}
              />
            </div>
          );
        })}
      </div>

      {/* Light: a slow sunbeam sweep, warm bloom and fine film grain */}
      {!still && <div className={`df-sunbeam pointer-events-none absolute inset-0 transition-opacity duration-[3000ms] ${lit ? "opacity-100" : "opacity-0"}`} />}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_70%_20%,rgba(255,226,170,0.16),transparent_55%)] mix-blend-screen" />
      <div className="df-grain pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay" />

      {/* Readability wash for the hero copy */}
      <div
        className={`absolute inset-0 bg-gradient-to-t from-forest/90 via-forest/40 to-forest/10 transition-opacity duration-[2500ms] md:bg-gradient-to-r md:from-[#0f1c16]/90 md:via-forest/45 md:to-transparent ${lit ? "opacity-100" : "opacity-0"}`}
      />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_220px_rgba(0,0,0,0.6)]" />

      {/* Room progress */}
      {lit && !still && (
        <div className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 gap-2 md:flex">
          {SLIDES.map((name, i) => (
            <span key={name} className="h-[2px] w-10 overflow-hidden bg-white/20">
              <span className={`block h-full bg-white/80 ${i === slide ? "df-progress" : i < slide ? "w-full" : "w-0"}`} style={{ animationDuration: `${SLIDE_MS}ms` }} />
            </span>
          ))}
        </div>
      )}

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
