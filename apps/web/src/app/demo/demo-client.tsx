"use client";

import { unitTileCount, unitTileGrid } from "@one-portrait/shared";
import { useEffect, useRef, useState } from "react";

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
  submissionNo: 2000,
} as const;
const revealDurationMs = 3600;

export function DemoClient(): React.ReactElement {
  const [isConnected, setIsConnected] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const displaySubmittedCount = previewUrl ? maxSlots : submittedCount;

  useEffect(() => {
    return () => {
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

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    previewUrlRef.current = nextPreviewUrl;
    setPreviewUrl(nextPreviewUrl);
  };

  return (
    <main aria-label="Takeru Unit demo" className="op-demo op-demo-unit">
      <section
        aria-label="Athlete unit overview"
        className="op-demo-unit-overview"
      >
        <div className="op-demo-unit-athlete">
          <div className="op-demo-unit-athlete-copy">
            <p className="op-eyebrow">
              <span className="bar" />
              <span>ONE Portrait demo unit</span>
            </p>
            <h1>{takeru.name}</h1>
            <p>
              A fixed demo unit for {takeru.name}, ready for the final fan
              submission.
            </p>
          </div>
          <div className="op-demo-unit-athlete-media">
            {/* biome-ignore lint/performance/noImgElement: public demo cutout asset */}
            <img src={takeru.imageSrc} alt={takeru.name} />
          </div>
        </div>

        <div className="op-demo-unit-grid">
          <article className="op-demo-unit-card">
            <span>Athlete</span>
            <strong>{takeru.name}</strong>
            <p>
              {takeru.country} / {takeru.discipline}
            </p>
          </article>

          <article className="op-demo-unit-card">
            <span>Unit</span>
            <strong>Takeru Demo Unit</strong>
            <p>Fixed demo flow</p>
          </article>

          <article className="op-demo-unit-card">
            <span>Progress</span>
            <strong>
              {displaySubmittedCount} / {maxSlots}
            </strong>
            <p>
              {previewUrl
                ? "The final demo slot is locally staged."
                : "One slot remains before reveal."}
            </p>
          </article>

          <article className="op-demo-unit-card op-demo-unit-reveal-card">
            {previewUrl ? (
              <DemoCompletionReveal originalPhotoUrl={previewUrl} />
            ) : (
              <>
                <span>Reveal area</span>
                <strong>Awaiting final photo</strong>
                <p>The completed portrait preview will appear here later.</p>
              </>
            )}
          </article>
        </div>
      </section>

      <section aria-label="Submission panel" className="op-demo-unit-submit">
        <div>
          <p className="op-eyebrow">
            <span className="bar" />
            <span>Submission panel</span>
          </p>
          <h2>Submit your photo</h2>
          <p>
            This stage demo uses local-only wallet state and a mock submission
            preview.
          </p>
        </div>

        <div className="op-demo-unit-submit-steps">
          <div>
            <span>01</span>
            <strong>Connect wallet</strong>
          </div>
          <div>
            <span>02</span>
            <strong>Choose photo</strong>
          </div>
          <div>
            <span>03</span>
            <strong>Submit photo</strong>
          </div>
        </div>

        {isConnected ? (
          <div className="op-demo-unit-wallet-panel">
            <p>
              <strong>Demo wallet connected</strong>
              <span>{demoAddress}</span>
            </p>
            <label>
              <span>Choose one image</span>
              <input
                accept="image/*"
                aria-label="Choose one image"
                onChange={handleImageChange}
                type="file"
              />
            </label>
            {previewUrl ? (
              <div className="op-demo-unit-preview">
                {/* biome-ignore lint/performance/noImgElement: local object URL preview */}
                <img alt="Selected submission preview" src={previewUrl} />
              </div>
            ) : null}
            <button disabled type="button">
              Mock local submit
            </button>
          </div>
        ) : (
          <div className="op-demo-unit-wallet-actions">
            <button
              className="op-btn-primary"
              onClick={connectDemoWallet}
              type="button"
            >
              Continue with Google zkLogin
            </button>
            <button
              className="op-btn-ghost"
              onClick={connectDemoWallet}
              type="button"
            >
              Connect Sui wallet
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

function DemoCompletionReveal({
  originalPhotoUrl,
}: {
  readonly originalPhotoUrl: string;
}): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const reducedMotion = prefersReducedMotion();
  const [highlightVisible, setHighlightVisible] = useState(true);
  const [chapter, setChapter] = useState(
    reducedMotion ? "Completed mosaic revealed." : "Final fan photo accepted.",
  );
  const highlightLabel = highlightVisible ? "Hide highlight" : "Show highlight";

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    const image = new Image();
    let cancelled = false;

    const render = (timestamp: number): void => {
      if (startRef.current === null) {
        startRef.current = timestamp;
      }

      const elapsed = timestamp - startRef.current;
      const progress = reducedMotion
        ? 1
        : Math.min(1, elapsed / revealDurationMs);

      drawDemoRevealFrame(canvas, context, image, progress);

      const nextChapter =
        progress >= 1
          ? "Completed mosaic revealed."
          : progress > 0.62
            ? "40 x 50 tiles are locking into the final portrait."
            : "Final fan photo accepted.";
      setChapter((current) =>
        current === nextChapter ? current : nextChapter,
      );

      if (progress < 1) {
        frameRef.current = window.requestAnimationFrame(render);
      }
    };

    image.onload = () => {
      if (!cancelled) {
        frameRef.current = window.requestAnimationFrame(render);
      }
    };
    image.src = completedMosaicSrc;

    if (reducedMotion) {
      frameRef.current = window.requestAnimationFrame(render);
    }

    return () => {
      cancelled = true;
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [reducedMotion]);

  return (
    <div
      className="op-demo-completion-reveal"
      data-testid="demo-completion-reveal"
    >
      <canvas
        aria-label="Demo completion reveal canvas"
        className="op-demo-completion-canvas"
        data-testid="demo-completion-canvas"
        ref={canvasRef}
      />
      <div className="op-demo-completion-fallback">
        {/* biome-ignore lint/performance/noImgElement: public completed demo mosaic asset */}
        <img alt="Completed Takeru mosaic" src={completedMosaicSrc} />
        {highlightVisible ? (
          <div
            className="op-demo-placement-highlight op-placement-highlight-frame op-placement-highlight-pulse"
            data-testid="demo-placement-highlight"
            style={{
              left: `${(demoPlacement.x / unitTileGrid.cols) * 100}%`,
              top: `${(demoPlacement.y / unitTileGrid.rows) * 100}%`,
              width: `${100 / unitTileGrid.cols}%`,
              height: `${100 / unitTileGrid.rows}%`,
            }}
          />
        ) : null}
      </div>
      <div className="op-demo-completion-copy">
        <span>Reveal area</span>
        <strong>{chapter}</strong>
        <p>
          {unitTileGrid.cols} x {unitTileGrid.rows} = {unitTileCount} tiles
        </p>
        <p>
          Your Kakera is highlighted at ({demoPlacement.x}, {demoPlacement.y})
          as #{demoPlacement.submissionNo}.
        </p>
        <button
          aria-pressed={highlightVisible}
          className="op-demo-highlight-toggle"
          onClick={() => setHighlightVisible((current) => !current)}
          type="button"
        >
          {highlightLabel}
        </button>
        <div className="op-demo-completion-original">
          {/* biome-ignore lint/performance/noImgElement: local object URL preview */}
          <img alt="Takeru original submission" src={originalPhotoUrl} />
        </div>
      </div>
    </div>
  );
}

function drawDemoRevealFrame(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  progress: number,
): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, rect.width || 520);
  const height = Math.max(1, rect.height || 300);
  const pixelWidth = Math.floor(width * dpr);
  const pixelHeight = Math.floor(height * dpr);

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);

  const targetAspect = unitTileGrid.cols / unitTileGrid.rows;
  const mosaicWidth = Math.min(width * 0.88, height * 0.72 * targetAspect);
  const mosaicHeight = mosaicWidth / targetAspect;
  const left = (width - mosaicWidth) / 2;
  const top = (height - mosaicHeight) / 2;

  context.fillStyle = "#070b10";
  context.fillRect(0, 0, width, height);

  if (image.complete && image.naturalWidth > 0) {
    context.save();
    context.globalAlpha = 0.2 + progress * 0.78;
    context.drawImage(image, left, top, mosaicWidth, mosaicHeight);
    context.restore();
  }

  const tileWidth = mosaicWidth / unitTileGrid.cols;
  const tileHeight = mosaicHeight / unitTileGrid.rows;
  const visibleTiles = Math.ceil(unitTileCount * progress);

  for (let index = 0; index < visibleTiles; index += 1) {
    const col = index % unitTileGrid.cols;
    const row = Math.floor(index / unitTileGrid.cols);
    const x = left + col * tileWidth;
    const y = top + row * tileHeight;

    context.fillStyle =
      index % 5 === 0
        ? "rgba(255, 122, 26, 0.34)"
        : "rgba(245, 239, 227, 0.16)";
    context.fillRect(
      x,
      y,
      Math.max(0.6, tileWidth - 0.4),
      Math.max(0.6, tileHeight - 0.4),
    );
  }

  context.strokeStyle = "rgba(245, 239, 227, 0.42)";
  context.lineWidth = 1;
  context.strokeRect(left, top, mosaicWidth, mosaicHeight);
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
