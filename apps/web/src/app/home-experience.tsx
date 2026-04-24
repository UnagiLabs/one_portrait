"use client";

import { unitTileCount, unitTileGrid } from "@one-portrait/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const mosaicSrc = "/demo/demo_mozaiku.png";
const fanUploadSrc = "/demo/fan-upload-dogs.png";
const revealDurationMs = 15000;
const photoTileSources = [
  fanUploadSrc,
  "/demo/generator-tiles/0.webp",
  "/demo/generator-tiles/1.webp",
  "/demo/generator-tiles/10.webp",
  "/demo/generator-tiles/100.webp",
  "/demo/generator-tiles/1000.webp",
  "/demo/generator-tiles/1001.webp",
  "/demo/generator-tiles/1002.webp",
  "/demo/generator-tiles/1003.webp",
  "/demo/generator-tiles/1004.webp",
  "/demo/generator-tiles/1005.webp",
  "/demo/generator-tiles/1006.webp",
  "/demo/generator-tiles/1057.webp",
  "/demo/generator-tiles/143.webp",
  "/demo/generator-tiles/198.webp",
  "/demo/generator-tiles/247.webp",
  "/demo/generator-tiles/304.webp",
  "/demo/generator-tiles/351.webp",
  "/demo/generator-tiles/407.webp",
  "/demo/generator-tiles/456.webp",
  "/demo/generator-tiles/47.webp",
  "/demo/generator-tiles/512.webp",
  "/demo/generator-tiles/563.webp",
  "/demo/generator-tiles/619.webp",
  "/demo/generator-tiles/672.webp",
  "/demo/generator-tiles/728.webp",
  "/demo/generator-tiles/781.webp",
  "/demo/generator-tiles/839.webp",
  "/demo/generator-tiles/894.webp",
  "/demo/generator-tiles/947.webp",
  "/demo/generator-tiles/96.webp",
] as const;

type Tile = {
  readonly col: number;
  readonly row: number;
  readonly startX: number;
  readonly startY: number;
  readonly controlX: number;
  readonly controlY: number;
  readonly delay: number;
  readonly duration: number;
  readonly photoIndex: number;
  readonly cropX: number;
  readonly cropY: number;
};

export function HomeScrollMotion(): null {
  useEffect(() => {
    const motionElements = Array.from(
      document.querySelectorAll<HTMLElement>("[data-op-motion]"),
    );
    if (motionElements.length === 0) {
      return;
    }

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let frameId = 0;

    const setRestingState = (): void => {
      for (const element of motionElements) {
        element.style.setProperty("--op-alpha", "1");
        element.style.setProperty("--op-blur", "0px");
        element.style.setProperty("--op-parallax-y", "0px");
        element.style.setProperty("--op-scale", "1");
        element.style.setProperty("--op-tilt", "0deg");
        element.style.setProperty("--op-y", "0px");
      }
    };

    if (reducedMotion) {
      setRestingState();
      return;
    }

    const update = (): void => {
      frameId = 0;
      const viewportHeight = window.innerHeight || 1;

      for (const element of motionElements) {
        const rect = element.getBoundingClientRect();
        const progress = clamp(
          (viewportHeight - rect.top) / (viewportHeight + rect.height),
          0,
          1,
        );
        const visible = smoothstep(0.06, 0.42, progress);
        const y = (1 - visible) * 86;
        const parallaxY = clamp((0.5 - progress) * 110, -52, 52);
        const scale = 0.86 + visible * 0.16;
        const tilt = (1 - visible) * -24;
        const alpha = 0.18 + visible * 0.82;
        const blur = (1 - visible) * 14;

        element.style.setProperty("--op-alpha", alpha.toFixed(3));
        element.style.setProperty("--op-blur", `${blur.toFixed(2)}px`);
        element.style.setProperty(
          "--op-parallax-y",
          `${parallaxY.toFixed(2)}px`,
        );
        element.style.setProperty("--op-scale", scale.toFixed(3));
        element.style.setProperty("--op-tilt", `${tilt.toFixed(2)}deg`);
        element.style.setProperty("--op-y", `${y.toFixed(2)}px`);
      }
    };

    const requestUpdate = (): void => {
      if (frameId === 0) {
        frameId = window.requestAnimationFrame(update);
      }
    };

    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
    };
  }, []);

  return null;
}

export function HomeSubmitSection(): React.ReactElement {
  return (
    <section
      className="op-home-submit op-home-scroll-reveal"
      data-op-motion="section"
      aria-label="Fan photo submission"
    >
      <div className="op-demo-submit-copy">
        <p className="op-eyebrow">
          <span className="bar" />
          <span>Step 02 — Submit your photo</span>
        </p>
        <h2 data-op-motion="headline">Your photo becomes one Kakera.</h2>
        <p>
          Each fan contributes one original photo. ONE Portrait stores the image
          on Walrus, submits the sponsored transaction on Sui, and mints a
          Soulbound Kakera for that fan.
        </p>
      </div>

      <div
        className="op-demo-submit-panel op-home-scroll-flip"
        data-op-motion="panel"
      >
        <div className="op-demo-phone">
          <div className="op-demo-upload-preview">
            {/* biome-ignore lint/performance/noImgElement: public demo upload asset */}
            <img src={fanUploadSrc} alt="Fan upload preview" />
            <div className="op-demo-upload-scan" aria-hidden />
          </div>
          <div className="op-home-photo-strip" aria-hidden>
            {photoTileSources.slice(0, 6).map((src) => (
              // biome-ignore lint/performance/noImgElement: temporary public photo texture
              <img src={src} alt="" key={src} />
            ))}
          </div>
          <div className="op-demo-submit-status">
            <span>Selected photo</span>
            <strong>Ready for Walrus</strong>
          </div>
        </div>

        <div className="op-demo-submit-steps">
          <div>
            <span>01</span>
            <strong>Google zkLogin</strong>
          </div>
          <div>
            <span>02</span>
            <strong>Walrus photo storage</strong>
          </div>
          <div>
            <span>03</span>
            <strong>Sponsored Sui transaction</strong>
          </div>
          <div>
            <span>04</span>
            <strong>Soulbound Kakera minted</strong>
          </div>
        </div>
      </div>
    </section>
  );
}

export function HomeMosaicReveal(): React.ReactElement {
  return (
    <section className="op-home-reveal" aria-label="Unit active reveal movie">
      <MosaicConvergence />
    </section>
  );
}

function MosaicConvergence(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const tileCacheRef = useRef<{
    readonly height: number;
    readonly tiles: readonly Tile[];
    readonly width: number;
  } | null>(null);
  const lastChapterRef = useRef("");
  const lastCountRef = useRef(1873);
  const [submittedCount, setSubmittedCount] = useState(1873);
  const [chapter, setChapter] = useState("Photos incoming");
  const [isReady, setIsReady] = useState(false);

  const imageSources = useMemo(
    () => [mosaicSrc, ...photoTileSources] as const,
    [],
  );
  const images = useLoadedImages(imageSources);

  const replay = useCallback(() => {
    startRef.current = null;
    tileCacheRef.current = null;
    lastChapterRef.current = "";
    lastCountRef.current = 1873;
    setSubmittedCount(1873);
    setChapter("Photos incoming");
  }, []);

  useEffect(() => {
    if (!images) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    setIsReady(true);
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const finalImage = images[0];
    const fanImages = images.slice(1);
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const render = (timestamp: number): void => {
      if (startRef.current === null) {
        startRef.current = timestamp;
      }

      const elapsed = timestamp - startRef.current;
      const loopElapsed = prefersReducedMotion
        ? revealDurationMs
        : elapsed % revealDurationMs;
      const progress = clamp(loopElapsed / revealDurationMs, 0, 1);
      const layout = prepareCanvas(canvas, context);
      const cached = tileCacheRef.current;
      const tiles =
        cached &&
        cached.width === layout.width &&
        cached.height === layout.height
          ? cached.tiles
          : createAndCacheTiles(tileCacheRef, layout.width, layout.height);

      drawRevealFrame({
        context,
        fanImages,
        finalImage,
        layout,
        progress,
        tiles,
      });

      const countProgress = smoothstep(0.08, 0.78, progress);
      const nextCount = Math.min(
        unitTileCount,
        1873 + Math.round((unitTileCount - 1873) * countProgress),
      );
      if (lastCountRef.current !== nextCount) {
        lastCountRef.current = nextCount;
        setSubmittedCount(nextCount);
      }

      const nextChapter = resolveRevealChapter(progress);
      if (lastChapterRef.current !== nextChapter) {
        lastChapterRef.current = nextChapter;
        setChapter(nextChapter);
      }

      animationRef.current = window.requestAnimationFrame(render);
    };

    animationRef.current = window.requestAnimationFrame(render);

    return () => {
      if (animationRef.current !== null) {
        window.cancelAnimationFrame(animationRef.current);
      }
    };
  }, [images]);

  return (
    <>
      <canvas className="op-demo-reveal-canvas" ref={canvasRef} aria-hidden />
      <div className="op-demo-reveal-overlay">
        <div
          className="op-demo-reveal-copy op-home-scroll-reveal"
          data-op-motion="headline"
        >
          <p className="op-eyebrow">
            <span className="bar" />
            <span>Unit active — hidden until reveal</span>
          </p>
          <h2>
            {submittedCount.toLocaleString()}
            <span> / {unitTileCount.toLocaleString()}</span>
          </h2>
          <p>{chapter}</p>
        </div>
        <div className="op-demo-reveal-controls">
          <span>
            {isReady
              ? "Photo tiles converge into one mosaic"
              : "Loading assets"}
          </span>
          <button className="op-btn-ghost" onClick={replay} type="button">
            Replay reveal
          </button>
        </div>
      </div>
    </>
  );
}

function useLoadedImages(
  sources: readonly string[],
): readonly HTMLImageElement[] | null {
  const [images, setImages] = useState<readonly HTMLImageElement[] | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    const pending = sources.map(
      (source) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = source;
        }),
    );

    Promise.all(pending)
      .then((loaded) => {
        if (!cancelled) {
          setImages(loaded);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImages([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sources]);

  return images && images.length > 0 ? images : null;
}

function prepareCanvas(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
): {
  readonly height: number;
  readonly mosaicHeight: number;
  readonly mosaicLeft: number;
  readonly mosaicTop: number;
  readonly mosaicWidth: number;
  readonly tileHeight: number;
  readonly tileWidth: number;
  readonly width: number;
} {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const pixelWidth = Math.floor(width * dpr);
  const pixelHeight = Math.floor(height * dpr);

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const targetAspect = unitTileGrid.cols / unitTileGrid.rows;
  const maxMosaicHeight = height * (width >= 900 ? 0.84 : 0.66);
  const maxMosaicWidth = width * (width >= 900 ? 0.42 : 0.7);
  const mosaicWidth = Math.min(maxMosaicWidth, maxMosaicHeight * targetAspect);
  const mosaicHeight = mosaicWidth / targetAspect;
  const mosaicLeft = width >= 900 ? width * 0.57 : (width - mosaicWidth) / 2;
  const mosaicTop = width >= 900 ? (height - mosaicHeight) / 2 : height * 0.3;

  return {
    height,
    mosaicHeight,
    mosaicLeft,
    mosaicTop,
    mosaicWidth,
    tileHeight: mosaicHeight / unitTileGrid.rows,
    tileWidth: mosaicWidth / unitTileGrid.cols,
    width,
  };
}

function drawRevealFrame(args: {
  readonly context: CanvasRenderingContext2D;
  readonly fanImages: readonly HTMLImageElement[];
  readonly finalImage: HTMLImageElement;
  readonly layout: ReturnType<typeof prepareCanvas>;
  readonly progress: number;
  readonly tiles: readonly Tile[];
}): void {
  const { context, fanImages, finalImage, layout, progress, tiles } = args;
  context.clearRect(0, 0, layout.width, layout.height);
  drawArenaBackground(context, layout, progress);

  const finalFade = smoothstep(0.78, 0.94, progress);
  const tileBorderOpacity = 0.18 * (1 - smoothstep(0.84, 1, progress));

  context.save();
  context.globalAlpha = 0.22 + finalFade * 0.5;
  context.shadowColor = "rgba(255,122,26,0.45)";
  context.shadowBlur = 44;
  context.drawImage(
    finalImage,
    layout.mosaicLeft,
    layout.mosaicTop,
    layout.mosaicWidth,
    layout.mosaicHeight,
  );
  context.restore();

  for (const tile of tiles) {
    drawTile({
      context,
      fanImages,
      finalFade,
      finalImage,
      layout,
      progress,
      tile,
      tileBorderOpacity,
    });
  }

  context.save();
  context.strokeStyle = `rgba(255, 122, 26, ${0.18 + finalFade * 0.35})`;
  context.lineWidth = 1;
  context.strokeRect(
    layout.mosaicLeft,
    layout.mosaicTop,
    layout.mosaicWidth,
    layout.mosaicHeight,
  );
  context.restore();
}

function drawTile(args: {
  readonly context: CanvasRenderingContext2D;
  readonly fanImages: readonly HTMLImageElement[];
  readonly finalFade: number;
  readonly finalImage: HTMLImageElement;
  readonly layout: ReturnType<typeof prepareCanvas>;
  readonly progress: number;
  readonly tile: Tile;
  readonly tileBorderOpacity: number;
}): void {
  const {
    context,
    fanImages,
    finalFade,
    finalImage,
    layout,
    progress,
    tile,
    tileBorderOpacity,
  } = args;
  const local = clamp((progress - tile.delay) / tile.duration, 0, 1);
  if (local <= 0) {
    return;
  }

  const eased = easeOutCubic(local);
  const targetX = layout.mosaicLeft + tile.col * layout.tileWidth;
  const targetY = layout.mosaicTop + tile.row * layout.tileHeight;
  const curve = Math.sin(Math.PI * eased);
  const x = quadratic(tile.startX, tile.controlX, targetX, eased);
  const y = quadratic(tile.startY, tile.controlY, targetY, eased);
  const sizeBoost = 2.2 - eased;
  const tileWidth = layout.tileWidth * sizeBoost;
  const tileHeight = layout.tileHeight * sizeBoost;
  const drawX = x - (tileWidth - layout.tileWidth) / 2;
  const drawY = y - (tileHeight - layout.tileHeight) / 2 + curve * 8;
  const finalCropAlpha = smoothstep(0.54, 0.96, local);
  const fanPhotoAlpha = (1 - finalCropAlpha) * (0.36 + eased * 0.62);

  context.save();
  context.globalAlpha = fanPhotoAlpha;
  drawPhotoTile(context, fanImages, tile, drawX, drawY, tileWidth, tileHeight);
  context.restore();

  context.save();
  context.globalAlpha = Math.max(finalCropAlpha, finalFade);
  const sw = finalImage.width / unitTileGrid.cols;
  const sh = finalImage.height / unitTileGrid.rows;
  context.drawImage(
    finalImage,
    tile.col * sw,
    tile.row * sh,
    sw,
    sh,
    drawX,
    drawY,
    tileWidth,
    tileHeight,
  );
  context.restore();

  if (tileBorderOpacity > 0.01) {
    context.save();
    context.strokeStyle = `rgba(255, 239, 210, ${tileBorderOpacity})`;
    context.lineWidth = 0.5;
    context.strokeRect(drawX, drawY, tileWidth, tileHeight);
    context.restore();
  }
}

function drawPhotoTile(
  context: CanvasRenderingContext2D,
  fanImages: readonly HTMLImageElement[],
  tile: Tile,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const source = fanImages[tile.photoIndex % Math.max(1, fanImages.length)];
  if (!source) {
    context.fillStyle = "#241511";
    context.fillRect(x, y, width, height);
    return;
  }

  const targetAspect = width / height;
  const sourceAspect = source.width / source.height;
  const cropHeight =
    sourceAspect > targetAspect ? source.height : source.width / targetAspect;
  const cropWidth = cropHeight * targetAspect;
  const maxCropX = Math.max(0, source.width - cropWidth);
  const maxCropY = Math.max(0, source.height - cropHeight);
  const sx = maxCropX * tile.cropX;
  const sy = maxCropY * tile.cropY;

  context.drawImage(source, sx, sy, cropWidth, cropHeight, x, y, width, height);

  const shade = context.createLinearGradient(x, y, x + width, y + height);
  shade.addColorStop(0, "rgba(255,255,255,0.2)");
  shade.addColorStop(0.45, "rgba(255,255,255,0.02)");
  shade.addColorStop(1, "rgba(0,0,0,0.36)");
  context.fillStyle = shade;
  context.fillRect(x, y, width, height);
}

function drawArenaBackground(
  context: CanvasRenderingContext2D,
  layout: ReturnType<typeof prepareCanvas>,
  progress: number,
): void {
  const { height, width } = layout;
  const bg = context.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#050302");
  bg.addColorStop(0.45, "#100805");
  bg.addColorStop(1, "#030608");
  context.fillStyle = bg;
  context.fillRect(0, 0, width, height);

  const ember = context.createRadialGradient(
    width * 0.72,
    height * 0.46,
    0,
    width * 0.72,
    height * 0.46,
    width * 0.42,
  );
  ember.addColorStop(0, `rgba(255, 122, 26, ${0.22 + progress * 0.16})`);
  ember.addColorStop(0.58, "rgba(212, 50, 14, 0.08)");
  ember.addColorStop(1, "rgba(5, 3, 2, 0)");
  context.fillStyle = ember;
  context.fillRect(0, 0, width, height);

  const sui = context.createRadialGradient(
    width * 0.16,
    height * 0.78,
    0,
    width * 0.16,
    height * 0.78,
    width * 0.34,
  );
  sui.addColorStop(0, "rgba(77, 162, 255, 0.16)");
  sui.addColorStop(1, "rgba(77, 162, 255, 0)");
  context.fillStyle = sui;
  context.fillRect(0, 0, width, height);

  context.save();
  context.globalAlpha = 0.14;
  context.strokeStyle = "rgba(245, 239, 227, 0.42)";
  context.lineWidth = 1;
  const step = 44;
  const offset = (progress * 160) % step;
  for (let x = -step; x < width + step; x += step) {
    context.beginPath();
    context.moveTo(x + offset, 0);
    context.lineTo(x - height * 0.38 + offset, height);
    context.stroke();
  }
  context.restore();
}

function createTiles(width: number, height: number): readonly Tile[] {
  const random = seededRandom(20260429);
  const tiles: Tile[] = [];

  for (let row = 0; row < unitTileGrid.rows; row += 1) {
    for (let col = 0; col < unitTileGrid.cols; col += 1) {
      const side = Math.floor(random() * 4);
      const start =
        side === 0
          ? { x: -120 - random() * width * 0.4, y: random() * height }
          : side === 1
            ? {
                x: width + 120 + random() * width * 0.4,
                y: random() * height,
              }
            : side === 2
              ? { x: random() * width, y: -140 - random() * height * 0.25 }
              : {
                  x: random() * width,
                  y: height + 140 + random() * height * 0.25,
                };

      tiles.push({
        col,
        controlX: width * (0.28 + random() * 0.38),
        controlY: height * (0.16 + random() * 0.68),
        cropX: random(),
        cropY: random(),
        delay: 0.06 + random() * 0.58 + (row / unitTileGrid.rows) * 0.08,
        duration: 0.26 + random() * 0.28,
        photoIndex: Math.floor(random() * photoTileSources.length),
        row,
        startX: start.x,
        startY: start.y,
      });
    }
  }

  return tiles;
}

function createAndCacheTiles(
  cacheRef: React.MutableRefObject<{
    readonly height: number;
    readonly tiles: readonly Tile[];
    readonly width: number;
  } | null>,
  width: number,
  height: number,
): readonly Tile[] {
  const tiles = createTiles(width, height);
  cacheRef.current = { height, tiles, width };
  return tiles;
}

function resolveRevealChapter(progress: number): string {
  if (progress < 0.22) {
    return "Fan photos are entering the arena from every side.";
  }
  if (progress < 0.56) {
    return "Walrus photo fragments lock into a 40 x 50 grid.";
  }
  if (progress < 0.78) {
    return "The final Kakera is approaching the portrait.";
  }
  if (progress < 0.92) {
    return "Unit filled. The synchronized reveal begins.";
  }
  return "Completed mosaic revealed. Kakera memories are minted.";
}

function seededRandom(seed: number): () => number {
  let value = seed;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function quadratic(start: number, control: number, end: number, t: number) {
  return (1 - t) * (1 - t) * start + 2 * (1 - t) * t * control + t * t * end;
}

function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
