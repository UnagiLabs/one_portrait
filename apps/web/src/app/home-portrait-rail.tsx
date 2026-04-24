"use client";

import { type ReactNode, useCallback, useEffect, useRef } from "react";

const fallbackCardStepPx = 266;
const manualPauseMs = 3200;
const loopDurationMs = 48000;

export function HomePortraitRail({
  children,
}: {
  readonly children: ReactNode;
}): React.ReactElement {
  const railRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const pauseUntilRef = useRef(0);

  const getLoopWidth = useCallback((): number => {
    const track = trackRef.current;
    if (!track) {
      return 0;
    }

    return track.scrollWidth / 2;
  }, []);

  const getCardStep = useCallback((): number => {
    const track = trackRef.current;
    const firstCard = track?.querySelector<HTMLElement>(
      ".op-home-portrait-card, .op-home-portrait-card-link",
    );
    if (!track || !firstCard) {
      return fallbackCardStepPx;
    }

    const cardWidth = firstCard.getBoundingClientRect().width;
    const gap = Number.parseFloat(window.getComputedStyle(track).columnGap);
    const step = cardWidth + (Number.isFinite(gap) ? gap : 0);
    return step > 0 ? Math.round(step) : fallbackCardStepPx;
  }, []);

  const normalizeLoopPosition = useCallback((): void => {
    const rail = railRef.current;
    const loopWidth = getLoopWidth();
    if (!rail || loopWidth <= 0) {
      return;
    }

    if (rail.scrollLeft >= loopWidth) {
      rail.scrollLeft -= loopWidth;
    }
  }, [getLoopWidth]);

  const moveRail = useCallback(
    (direction: -1 | 1): void => {
      const rail = railRef.current;
      if (!rail) {
        return;
      }

      const step = getCardStep();
      const loopWidth = getLoopWidth();
      pauseUntilRef.current = Date.now() + manualPauseMs;

      if (direction < 0 && loopWidth > 0 && rail.scrollLeft <= 1) {
        rail.scrollLeft += loopWidth;
      }

      if (
        direction > 0 &&
        loopWidth > 0 &&
        rail.scrollLeft >= loopWidth - step
      ) {
        rail.scrollLeft -= loopWidth;
      }

      rail.scrollBy({
        behavior: "smooth",
        left: direction * step,
      });
    },
    [getCardStep, getLoopWidth],
  );

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) {
      return;
    }

    const prefersReducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      return;
    }

    let frameId = 0;
    let lastFrameTime = 0;

    const animate = (time: number): void => {
      frameId = window.requestAnimationFrame(animate);
      if (lastFrameTime === 0) {
        lastFrameTime = time;
        return;
      }

      const elapsed = time - lastFrameTime;
      lastFrameTime = time;
      if (Date.now() < pauseUntilRef.current) {
        return;
      }

      const loopWidth = getLoopWidth();
      if (loopWidth <= 0) {
        return;
      }

      rail.scrollLeft += (elapsed * loopWidth) / loopDurationMs;
      normalizeLoopPosition();
    };

    frameId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [getLoopWidth, normalizeLoopPosition]);

  return (
    <div className="op-home-portrait-rail-shell">
      <button
        aria-label="Previous portraits"
        className="op-home-portrait-nav is-prev"
        onClick={() => moveRail(-1)}
        type="button"
      >
        <RailArrow direction="prev" />
      </button>
      <div className="op-home-portrait-rail" ref={railRef}>
        <div className="op-home-portrait-track" ref={trackRef}>
          {children}
        </div>
      </div>
      <button
        aria-label="Next portraits"
        className="op-home-portrait-nav is-next"
        onClick={() => moveRail(1)}
        type="button"
      >
        <RailArrow direction="next" />
      </button>
    </div>
  );
}

function RailArrow({
  direction,
}: {
  readonly direction: "next" | "prev";
}): React.ReactElement {
  const path =
    direction === "next" ? "M7 4 L13 10 L7 16" : "M13 4 L7 10 L13 16";

  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      viewBox="0 0 20 20"
      width="20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d={path}
        stroke="currentColor"
        strokeLinecap="square"
        strokeLinejoin="miter"
        strokeWidth="1.8"
      />
    </svg>
  );
}
