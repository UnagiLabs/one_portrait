import Link from "next/link";

import { getAthleteCatalog } from "../../lib/catalog";
import { loadPublicEnv } from "../../lib/env";

import { GalleryClient } from "./gallery-client";

export default async function GalleryPage(): Promise<React.ReactElement> {
  const catalog = await getAthleteCatalog();
  const packageId = safePackageId();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#15366d,_#071120_55%,_#02060d)] px-6 py-16 text-slate-50">
      <div className="mx-auto grid max-w-5xl gap-8">
        <nav>
          <Link
            className="text-sm uppercase tracking-[0.3em] text-cyan-200/80 hover:text-cyan-100"
            href="/"
          >
            ← All athletes
          </Link>
        </nav>

        <header className="grid gap-4 rounded-[2rem] border border-white/10 bg-white/6 p-8 shadow-2xl shadow-black/30 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">
            History
          </p>
          <h1 className="font-serif text-4xl text-white md:text-5xl">
            Participation gallery
          </h1>
          <p className="max-w-2xl text-base leading-7 text-slate-200">
            Rebuild your on-chain participation history from the Kakera your
            wallet already owns.
          </p>
        </header>

        <GalleryClient catalog={catalog} packageId={packageId ?? ""} />
      </div>
    </main>
  );
}

function safePackageId(): string | null {
  try {
    return loadPublicEnv(process.env).packageId;
  } catch {
    return null;
  }
}
