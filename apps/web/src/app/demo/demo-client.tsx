"use client";

import { unitTileCount } from "@one-portrait/shared";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MasterPlacementView } from "../../lib/sui";
import { MosaicConvergence } from "../home-experience";
import { RevealPanel } from "../units/[unitId]/reveal-panel";

const takeru = {
  name: "Takeru",
  country: "Japan",
  discipline: "Kickboxing",
  imageSrc: "/demo/one-athletes/Takeru-500x345-1.png",
} as const;

const submittedCount = 1999;
const maxSlots = unitTileCount;
const demoAddress = "0xdemo...2000";
const completedMosaicSrc = "/demo/demo_mozaiku.png";
const demoPlacement = {
  x: 37,
  y: 46,
  submitter: demoAddress,
  submissionNo: 2000,
} satisfies MasterPlacementView;
const demoRevealDurationMs = 3600;
const demoRevealHoldDurationMs = 1000;
const demoRevealHandoffDurationMs = 1600;
const demoUnitId =
  "0xdemo0000000000000000000000000000000000000000000000000000000007d0";
type DemoPhase =
  | "connected"
  | "previewing"
  | "revealingOverlay"
  | "revealHold"
  | "revealHandoff"
  | "completed";

export function DemoClient(): React.ReactElement {
  const [isConnected, setIsConnected] = useState(false);
  const [demoPhase, setDemoPhase] = useState<DemoPhase>("connected");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSubmitted =
    previewUrl !== null &&
    (demoPhase === "revealingOverlay" ||
      demoPhase === "revealHold" ||
      demoPhase === "revealHandoff" ||
      demoPhase === "completed");
  const displaySubmittedCount = isSubmitted ? maxSlots : submittedCount;
  const completeDemoReveal = useCallback(() => {
    setDemoPhase("revealHold");

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
    }

    if (handoffTimerRef.current) {
      clearTimeout(handoffTimerRef.current);
    }

    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      setDemoPhase("revealHandoff");

      handoffTimerRef.current = setTimeout(() => {
        handoffTimerRef.current = null;
        setDemoPhase("completed");
      }, demoRevealHandoffDurationMs);
    }, demoRevealHoldDurationMs);
  }, []);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
      }

      if (handoffTimerRef.current) {
        clearTimeout(handoffTimerRef.current);
      }

      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const connectDemoWallet = () => {
    setIsConnected(true);
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    if (handoffTimerRef.current) {
      clearTimeout(handoffTimerRef.current);
      handoffTimerRef.current = null;
    }

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    previewUrlRef.current = nextPreviewUrl;
    setPreviewUrl(nextPreviewUrl);
    setDemoPhase("previewing");
  };

  const confirmDemoSubmission = () => {
    if (!previewUrl) {
      return;
    }

    setDemoPhase(prefersReducedMotion() ? "completed" : "revealingOverlay");
  };

  return (
    <main
      aria-label="Takeru Unit demo"
      className="grain relative min-h-screen overflow-hidden text-[var(--ink)]"
    >
      <div className="mx-auto grid max-w-6xl gap-px bg-[var(--rule)] lg:grid-cols-[1fr_380px]">
        <section
          aria-label="Athlete unit overview"
          className="relative flex min-h-[80vh] flex-col justify-between gap-10 bg-[var(--bg-2)] p-8 md:p-12 lg:p-14"
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at 50% 45%, rgba(255, 122, 26, 0.08), transparent 65%)",
            }}
          />
          <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
            <nav className="flex flex-wrap items-center gap-4">
              <Link
                className="font-mono-op text-[11px] uppercase tracking-[0.14em] text-[var(--ink-dim)] hover:text-[var(--ink)]"
                href="/"
              >
                ← All athletes
              </Link>
              <Link
                className="font-mono-op text-[11px] uppercase tracking-[0.14em] text-[var(--ink-dim)] hover:text-[var(--ink)]"
                href="/gallery"
              >
                Participation history
              </Link>
            </nav>
            <div className="text-right font-mono-op text-[11px] text-[var(--ink-dim)]">
              <div>
                {takeru.name}{" "}
                <span className="text-[var(--ember)]">— UNIT</span>
              </div>
              <div className="mt-1 break-all text-[var(--ink-faint)]">
                one_portrait::unit · {demoUnitId.slice(0, 10)}…
              </div>
            </div>
          </div>

          <div className="relative z-10 grid justify-items-center gap-6 text-center">
            <div className="op-eyebrow">
              <span className="bar" />
              <span
                className="h-2 w-2 rounded-full bg-[var(--ember)]"
                style={{
                  boxShadow: "0 0 14px var(--ember)",
                  animation: "op-pulse 1s infinite",
                }}
              />
              <span>UNIT ACTIVE — HIDDEN UNTIL REVEAL</span>
            </div>

            {/* biome-ignore lint/performance/noImgElement: public demo cutout asset */}
            <img
              alt={takeru.name}
              className="h-24 w-24 rounded-none border border-[var(--rule-strong)] object-cover"
              src={takeru.imageSrc}
            />

            <h1 className="font-display text-[clamp(40px,7vw,88px)] leading-[0.9] tracking-[-0.01em] text-[var(--ink)]">
              {takeru.name}
            </h1>
            <p className="font-mono-op text-[11px] break-all text-[var(--ink-faint)]">
              {demoUnitId}
            </p>

            <div className="mt-4 w-full">
              <DemoProgress submittedCount={displaySubmittedCount} />
              {previewUrl &&
              (demoPhase === "revealHandoff" || demoPhase === "completed") ? (
                <DemoCompletionReveal originalPhotoUrl={previewUrl} />
              ) : null}
            </div>
          </div>

          <div className="relative z-10 text-right font-mono-op text-[11px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
            Stage demo · 0 SUI required
            <br />
            Local mock state · No network submission
          </div>
        </section>

        <aside
          aria-label="Submission panel"
          className="flex flex-col gap-6 bg-[var(--bg-2)] p-6 lg:p-7"
        >
          <DemoSubmissionPanel
            confirmDemoSubmission={confirmDemoSubmission}
            connectDemoWallet={connectDemoWallet}
            demoPhase={demoPhase}
            handleImageChange={handleImageChange}
            isConnected={isConnected}
            previewUrl={previewUrl}
          />
        </aside>
      </div>

      {previewUrl &&
      (demoPhase === "revealingOverlay" ||
        demoPhase === "revealHold" ||
        demoPhase === "revealHandoff") ? (
        <DemoRevealOverlay
          overlayState={
            demoPhase === "revealHandoff"
              ? "handoff"
              : demoPhase === "revealHold"
                ? "hold"
                : "revealing"
          }
          originalPhotoUrl={previewUrl}
          onComplete={completeDemoReveal}
        />
      ) : null}
    </main>
  );
}

function DemoProgress({
  submittedCount,
}: {
  readonly submittedCount: number;
}): React.ReactElement {
  const pct = (submittedCount / maxSlots) * 100;
  const remaining = Math.max(0, maxSlots - submittedCount);
  const progressLabel = submittedCount >= maxSlots ? "Filled" : "Filling";

  return (
    <div className="grid gap-5">
      <p aria-live="polite" className="op-big-counter tabular-nums">
        <span className="sr-only">{`${submittedCount} / ${maxSlots}`}</span>
        <span className="num">{submittedCount}</span>
        <span className="slash">/</span>
        <span className="total">{maxSlots}</span>
      </p>
      <div className="grid gap-2">
        <div className="op-progress-bar">
          <div className="op-progress-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-3 font-mono-op text-[11px] uppercase tracking-[0.14em] text-[var(--ink-dim)]">
          <span className="text-[var(--ember)]">{progressLabel}</span>
          <span>
            {remaining} tiles remaining · {submittedCount} Kakera minted
          </span>
        </div>
      </div>
    </div>
  );
}

function DemoSubmissionPanel({
  confirmDemoSubmission,
  connectDemoWallet,
  demoPhase,
  handleImageChange,
  isConnected,
  previewUrl,
}: {
  readonly confirmDemoSubmission: () => void;
  readonly connectDemoWallet: () => void;
  readonly demoPhase: DemoPhase;
  readonly handleImageChange: (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => void;
  readonly isConnected: boolean;
  readonly previewUrl: string | null;
}): React.ReactElement {
  const hasPreview = previewUrl !== null;
  const submissionLocked =
    demoPhase === "revealingOverlay" || demoPhase === "completed";

  return (
    <section className="grid gap-4 border border-[var(--rule)] bg-[rgba(245,239,227,0.03)] p-5">
      <div className="grid gap-2">
        <p className="op-eyebrow">
          <span className="bar" />
          <span>Submit access</span>
        </p>
        <h2 className="font-display text-[24px] leading-[0.95] tracking-[-0.01em] text-[var(--ink)]">
          Participation wallet
        </h2>
      </div>

      {isConnected ? (
        <>
          <p className="text-sm text-[var(--ink-dim)]">
            Demo wallet address confirmed. This local state signs nothing and
            keeps the stage flow offline.
          </p>
          <p className="font-mono-op text-[11px] break-all text-[var(--ember)]">
            {demoAddress}
          </p>

          <label className="grid gap-2 font-mono-op text-[11px] uppercase tracking-[0.14em] text-[var(--ink-dim)]">
            <span>Choose one image</span>
            <input
              accept="image/*"
              aria-label="Choose one image"
              className="op-file-input block w-full font-mono-op text-[11px] text-[var(--ink)]"
              onChange={handleImageChange}
              type="file"
            />
          </label>

          {previewUrl ? (
            // biome-ignore lint/performance/noImgElement: local object URL preview
            <img
              alt="Selected submission preview"
              className="max-w-full border border-[var(--rule-strong)]"
              src={previewUrl}
            />
          ) : null}

          <button
            className="op-btn-primary"
            disabled={!hasPreview || submissionLocked}
            onClick={confirmDemoSubmission}
            type="button"
          >
            Confirm submission
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-[var(--ink-dim)]">
            Connect Google zkLogin or Sui wallet to submit from this waiting
            room.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              className="op-btn-primary"
              onClick={connectDemoWallet}
              type="button"
            >
              Google zkLogin
            </button>
            <button
              className="op-btn-ghost"
              onClick={connectDemoWallet}
              type="button"
            >
              Sui wallet
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function DemoCompletionReveal({
  originalPhotoUrl,
}: {
  readonly originalPhotoUrl: string;
}): React.ReactElement {
  return (
    <div
      className="op-demo-completion-arrival mt-8 grid gap-5"
      data-testid="demo-completion-reveal"
    >
      <RevealPanel
        displayName={takeru.name}
        mosaicUrl={completedMosaicSrc}
        originalPhotoUrl={originalPhotoUrl}
        placement={demoPlacement}
      />
    </div>
  );
}

function DemoRevealOverlay({
  overlayState,
  originalPhotoUrl,
  onComplete,
}: {
  readonly overlayState: "revealing" | "hold" | "handoff";
  readonly originalPhotoUrl: string;
  readonly onComplete: () => void;
}): React.ReactElement {
  const tileSources = useMemo(() => [originalPhotoUrl], [originalPhotoUrl]);
  const isHandoff = overlayState === "handoff";

  return (
    <section
      aria-label="Demo full-screen reveal"
      className={["op-demo-reveal-fullscreen", isHandoff ? "is-handoff" : ""]
        .filter(Boolean)
        .join(" ")}
      data-state={overlayState}
      data-testid="demo-reveal-overlay"
    >
      <MosaicConvergence
        copyClassName=""
        durationMs={demoRevealDurationMs}
        eyebrowText="Unit active — hidden until reveal"
        finalCount={unitTileCount}
        initialChapter="Unit filled. The synchronized reveal begins."
        initialCount={submittedCount}
        mode="once"
        onComplete={onComplete}
        showReplay={false}
        tileSources={tileSources}
      />
      {isHandoff ? (
        <div
          aria-hidden="true"
          className="op-demo-reveal-handoff"
          data-testid="demo-reveal-handoff"
        />
      ) : null}
    </section>
  );
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
