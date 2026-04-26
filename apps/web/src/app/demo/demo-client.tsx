"use client";

import { useEffect, useRef, useState } from "react";

const takeru = {
  name: "Takeru",
  country: "Japan",
  discipline: "Kickboxing",
  imageSrc: "/demo/one-athletes/Takeru-500x345-1.png",
} as const;

const submittedCount = 1999;
const maxSlots = 2000;
const demoAddress = "0xdemo...2000";

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
            <span>Reveal area</span>
            <strong>Awaiting final photo</strong>
            <p>The completed portrait preview will appear here later.</p>
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

        <div className="op-demo-unit-submit-steps" aria-label="Submission flow">
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
