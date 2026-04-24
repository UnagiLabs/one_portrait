"use client";

import { unitTileCount, unitTileGrid } from "@one-portrait/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type AthleteAsset = {
  readonly name: string;
  readonly country: string;
  readonly role: string;
  readonly src: string;
};

type Tile = {
  readonly col: number;
  readonly row: number;
  readonly startX: number;
  readonly startY: number;
  readonly controlX: number;
  readonly controlY: number;
  readonly delay: number;
  readonly duration: number;
  readonly fanIndex: number;
};

type FanTileStyle = {
  readonly background: string;
  readonly clothing: string;
  readonly hair: string;
  readonly skin: string;
};

const athleteAssets: readonly AthleteAsset[] = [
  {
    name: "Yuya Wakamatsu",
    country: "Japan",
    role: "Champion portrait",
    src: "/demo/one-athletes/Yuya_Wakamatsu-avatar-champ-500x345-1.png",
  },
  {
    name: "Takeru",
    country: "Japan",
    role: "Kickboxing icon",
    src: "/demo/one-athletes/Takeru-500x345-1.png",
  },
  {
    name: "Rodtang Jitmuangnon",
    country: "Thailand",
    role: "Muay Thai force",
    src: "/demo/one-athletes/Rodtang_Jitmuangnon-Avatar-500x345-1.png",
  },
  {
    name: "Ayaka Miura",
    country: "Japan",
    role: "Submission artist",
    src: "/demo/one-athletes/Ayaka_Miura-avatar-500x345-1.png",
  },
  {
    name: "Itsuki Hirata",
    country: "Japan",
    role: "Atomweight star",
    src: "/demo/one-athletes/Itsuki_Hirata-avatar-500x345-4.png",
  },
  {
    name: "Jonathan Haggerty",
    country: "United Kingdom",
    role: "Striking champion",
    src: "/demo/one-athletes/Jonathan_Haggerty-avatar-500x345-4.png",
  },
  {
    name: "Ritu Phogat",
    country: "India",
    role: "Wrestling pressure",
    src: "/demo/one-athletes/Ritu_Phogat-avatar-500x345-1.png",
  },
  {
    name: "Toma Kuroda",
    country: "Japan",
    role: "Flyweight contender",
    src: "/demo/one-athletes/Toma_Kuroda-avatar-500x345-1.png",
  },
  {
    name: "Yuki Yoza",
    country: "Japan",
    role: "Kickboxing precision",
    src: "/demo/one-athletes/Yuki_Yoza-avatar-500x345-1.png",
  },
  {
    name: "Chihiro Sawada",
    country: "Japan",
    role: "Grappling speed",
    src: "/demo/one-athletes/Chihiro_Sawada-avatar-500x345-3.png",
  },
  {
    name: "Avazbek Kholmirzaev",
    country: "Uzbekistan",
    role: "Rising force",
    src: "/demo/one-athletes/Avazbek_Kholmirzaev-Avatar-500x345-1.png",
  },
];

const mosaicSrc = "/demo/demo_mozaiku.png";
const revealDurationMs = 15000;
const rosterLoop = [...athleteAssets, ...athleteAssets].map(
  (athlete, index) => ({
    athlete,
    id: `${index < athleteAssets.length ? "first" : "second"}-${athlete.name}`,
  }),
);
const openingStats = [
  { label: "Fan photos", value: unitTileCount.toLocaleString() },
  { label: "Sui gas", value: "0 SUI" },
  { label: "Reveal", value: "Sync" },
];
const fanTileStyles: readonly FanTileStyle[] = [
  {
    background: "#27364d",
    clothing: "#ff7a1a",
    hair: "#17120f",
    skin: "#d89a62",
  },
  {
    background: "#462a2f",
    clothing: "#4da2ff",
    hair: "#2a1710",
    skin: "#b8734a",
  },
  {
    background: "#1d4339",
    clothing: "#14b88a",
    hair: "#100f0d",
    skin: "#f0bd86",
  },
  {
    background: "#3f3657",
    clothing: "#ffd166",
    hair: "#2b211c",
    skin: "#9e6545",
  },
  {
    background: "#4d2b19",
    clothing: "#d4320e",
    hair: "#090807",
    skin: "#e7a571",
  },
  {
    background: "#233f51",
    clothing: "#f5efe3",
    hair: "#3a2218",
    skin: "#c68455",
  },
];

export function DemoClient(): React.ReactElement {
  const revealRef = useRef<HTMLElement | null>(null);

  const jumpToReveal = (): void => {
    revealRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="op-demo">
      <section className="op-demo-hero" aria-label="Demo opening">
        <div className="op-demo-hero-media" aria-hidden>
          {/* biome-ignore lint/performance/noImgElement: public demo cutout asset */}
          <img
            className="op-demo-hero-athlete primary"
            src={athleteAssets[0].src}
            alt=""
          />
          {/* biome-ignore lint/performance/noImgElement: public demo cutout asset */}
          <img
            className="op-demo-hero-athlete left"
            src={athleteAssets[2].src}
            alt=""
          />
          {/* biome-ignore lint/performance/noImgElement: public demo cutout asset */}
          <img
            className="op-demo-hero-athlete mid-left"
            src={athleteAssets[9].src}
            alt=""
          />
          {/* biome-ignore lint/performance/noImgElement: public demo cutout asset */}
          <img
            className="op-demo-hero-athlete right"
            src={athleteAssets[1].src}
            alt=""
          />
          <div className="op-demo-grid-glow" />
        </div>

        <div className="op-demo-hero-copy">
          <p className="op-eyebrow">
            <span className="bar" />
            <span>ONE Samurai · 2026.04.29 · Ariake Arena</span>
          </p>
          <h1 className="op-demo-title">
            ONE Portrait
            <span>Reveal Arena</span>
          </h1>
          <p className="op-demo-lede">
            Fans submit one photo each. The final Kakera lands, 2,000 fragments
            converge, and a single portrait appears for everyone at once.
          </p>
          <div className="op-demo-stat-row">
            {openingStats.map((stat) => (
              <div className="op-demo-stat" key={stat.label}>
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </div>
          <button
            className="op-btn-primary"
            onClick={jumpToReveal}
            type="button"
          >
            Jump to reveal
          </button>
        </div>
      </section>

      <section className="op-demo-roster" aria-label="Athlete roster">
        <div className="op-demo-section-head">
          <p className="op-eyebrow">
            <span className="bar" />
            <span>Step 01 — Pick your warrior</span>
          </p>
          <h2>Pick the warrior the crowd stands behind.</h2>
        </div>
        <div className="op-demo-athlete-track">
          {rosterLoop.map(({ athlete, id }) => (
            <article className="op-demo-athlete-card" key={id}>
              {/* biome-ignore lint/performance/noImgElement: public demo cutout asset */}
              <img src={athlete.src} alt={athlete.name} />
              <div>
                <p>{athlete.country}</p>
                <h3>{athlete.name}</h3>
                <span>{athlete.role}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="op-demo-submit" aria-label="Fan photo submission">
        <div className="op-demo-submit-copy">
          <p className="op-eyebrow">
            <span className="bar" />
            <span>Step 02 — Submit your photo</span>
          </p>
          <h2>Your photo becomes one Kakera.</h2>
          <p>
            Each fan contributes one original photo. ONE Portrait stores the
            image on Walrus, submits the sponsored transaction on Sui, and mints
            a Soulbound Kakera for that fan.
          </p>
        </div>

        <div className="op-demo-submit-panel">
          <div className="op-demo-phone">
            <div className="op-demo-selfie-grid" aria-hidden>
              {fanTileStyles.map((style) => (
                <div
                  className="op-demo-selfie"
                  key={style.background}
                  style={
                    {
                      "--fan-bg": style.background,
                      "--fan-cloth": style.clothing,
                      "--fan-hair": style.hair,
                      "--fan-skin": style.skin,
                    } as React.CSSProperties
                  }
                >
                  <span />
                </div>
              ))}
            </div>
            <div className="op-demo-submit-status">
              <span>Preview ready</span>
              <strong>1 photo / 1 Kakera</strong>
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

      <section
        className="op-demo-reveal"
        ref={revealRef}
        aria-label="Mosaic reveal sequence"
      >
        <MosaicConvergence />
      </section>

      <section className="op-demo-kakera" aria-label="Kakera closing">
        <div className="op-demo-kakera-copy">
          <p className="op-eyebrow">
            <span className="bar" />
            <span>Kakera · Participation memory</span>
          </p>
          <h2>The memory becomes a Soulbound Kakera.</h2>
          <p>
            The demo closes on the participant view: the original photo, the
            completed mosaic, and the highlighted tile position recorded as a
            permanent on-chain memory.
          </p>
        </div>
        <div className="op-demo-kakera-card">
          <div className="op-demo-kakera-media">
            {/* biome-ignore lint/performance/noImgElement: public demo cutout asset */}
            <img src={athleteAssets[0].src} alt="Yuya Wakamatsu" />
          </div>
          <dl>
            <div>
              <dt>Kakera</dt>
              <dd>#2000</dd>
            </div>
            <div>
              <dt>Placement</dt>
              <dd>col 31 / row 44</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>Minted · Soulbound</dd>
            </div>
          </dl>
        </div>
      </section>
    </main>
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

  const imageSources = useMemo(() => [mosaicSrc], []);
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
        <div className="op-demo-reveal-copy">
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
            {isReady ? "Canvas 40 x 50 tile field" : "Loading assets"}
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
  readonly dpr: number;
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
    dpr,
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
  readonly finalImage: HTMLImageElement;
  readonly layout: ReturnType<typeof prepareCanvas>;
  readonly progress: number;
  readonly tiles: readonly Tile[];
}): void {
  const { context, finalImage, layout, progress, tiles } = args;
  context.clearRect(0, 0, layout.width, layout.height);
  drawArenaBackground(context, layout, progress);

  const finalFade = smoothstep(0.78, 0.94, progress);
  const tileBorderOpacity = 0.18 * (1 - smoothstep(0.84, 1, progress));

  context.save();
  context.globalAlpha = 0.28 + finalFade * 0.44;
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
      finalImage,
      finalFade,
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
  readonly finalImage: HTMLImageElement;
  readonly finalFade: number;
  readonly layout: ReturnType<typeof prepareCanvas>;
  readonly progress: number;
  readonly tile: Tile;
  readonly tileBorderOpacity: number;
}): void {
  const {
    context,
    finalImage,
    finalFade,
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
  const sizeBoost = 1.8 - eased * 0.78;
  const tileWidth = layout.tileWidth * sizeBoost;
  const tileHeight = layout.tileHeight * sizeBoost;
  const drawX = x - (tileWidth - layout.tileWidth) / 2;
  const drawY = y - (tileHeight - layout.tileHeight) / 2 + curve * 8;
  const finalCropAlpha = smoothstep(0.54, 0.96, local);
  const fanPhotoAlpha = (1 - finalCropAlpha) * (0.28 + eased * 0.62);

  context.save();
  context.globalAlpha = fanPhotoAlpha;
  drawFanPhotoTile(context, {
    height: tileHeight,
    seed: tile.fanIndex,
    width: tileWidth,
    x: drawX,
    y: drawY,
  });
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

function drawFanPhotoTile(
  context: CanvasRenderingContext2D,
  frame: {
    readonly height: number;
    readonly seed: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  },
): void {
  const style = fanTileStyles[frame.seed % fanTileStyles.length];
  const smile = frame.seed % 3 === 0;
  const headX = frame.x + frame.width * (0.5 + ((frame.seed % 7) - 3) * 0.018);
  const headY = frame.y + frame.height * 0.42;
  const headRadius = Math.max(1.2, Math.min(frame.width, frame.height) * 0.18);

  context.fillStyle = style.background;
  context.fillRect(frame.x, frame.y, frame.width, frame.height);

  const shine = context.createLinearGradient(
    frame.x,
    frame.y,
    frame.x + frame.width,
    frame.y + frame.height,
  );
  shine.addColorStop(0, "rgba(255,255,255,0.22)");
  shine.addColorStop(0.42, "rgba(255,255,255,0.02)");
  shine.addColorStop(1, "rgba(0,0,0,0.3)");
  context.fillStyle = shine;
  context.fillRect(frame.x, frame.y, frame.width, frame.height);

  context.fillStyle = style.clothing;
  context.beginPath();
  context.ellipse(
    frame.x + frame.width * 0.5,
    frame.y + frame.height * 0.98,
    frame.width * 0.42,
    frame.height * 0.34,
    0,
    Math.PI,
    Math.PI * 2,
  );
  context.fill();

  context.fillStyle = style.skin;
  context.beginPath();
  context.arc(headX, headY, headRadius, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = style.hair;
  context.beginPath();
  context.ellipse(
    headX,
    headY - headRadius * 0.52,
    headRadius * 0.96,
    headRadius * 0.52,
    0,
    Math.PI,
    Math.PI * 2,
  );
  context.fill();

  context.fillStyle = "rgba(5,3,2,0.62)";
  const eyeRadius = Math.max(0.35, headRadius * 0.11);
  context.beginPath();
  context.arc(headX - headRadius * 0.36, headY, eyeRadius, 0, Math.PI * 2);
  context.arc(headX + headRadius * 0.36, headY, eyeRadius, 0, Math.PI * 2);
  context.fill();

  if (smile && frame.width > 8) {
    context.strokeStyle = "rgba(5,3,2,0.54)";
    context.lineWidth = Math.max(0.45, frame.width * 0.025);
    context.beginPath();
    context.arc(
      headX,
      headY + headRadius * 0.22,
      headRadius * 0.36,
      0.18 * Math.PI,
      0.82 * Math.PI,
    );
    context.stroke();
  }

  context.strokeStyle = "rgba(255,255,255,0.18)";
  context.lineWidth = 0.75;
  context.strokeRect(frame.x, frame.y, frame.width, frame.height);
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
        delay: 0.06 + random() * 0.58 + (row / unitTileGrid.rows) * 0.08,
        duration: 0.26 + random() * 0.28,
        fanIndex: Math.floor(random() * 10000),
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
    return "Fans are entering the arena from every side.";
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
