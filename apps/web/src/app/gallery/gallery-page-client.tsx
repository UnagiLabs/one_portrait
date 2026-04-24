"use client";

import dynamic from "next/dynamic";

import type { GalleryClientProps } from "./gallery-client";

const GalleryClient = dynamic<GalleryClientProps>(
  () => import("./gallery-client").then((module) => module.GalleryClient),
  {
    ssr: false,
    loading: () => (
      <section className="rounded-[1.75rem] border border-cyan-300/20 bg-cyan-400/10 p-7">
        <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">
          Loading
        </p>
        <p className="mt-3 text-slate-100">Preparing the gallery.</p>
      </section>
    ),
  },
);

export function GalleryPageClient(
  props: GalleryClientProps,
): React.ReactElement {
  return <GalleryClient {...props} />;
}
