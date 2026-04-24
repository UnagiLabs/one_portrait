import Link from "next/link";

import { getAthleteCatalog } from "../../lib/catalog";
import { getDemoGalleryEntries, isDemoModeEnabled } from "../../lib/demo";
import { loadPublicEnv } from "../../lib/env";

import { GalleryPageClient } from "./gallery-page-client";

export const dynamic = "force-dynamic";

type GalleryPageProps = {
  readonly searchParams?: Promise<{
    readonly op_e2e_gallery_state?: string;
  }>;
};

export default async function GalleryPage(
  props: GalleryPageProps = {},
): Promise<React.ReactElement> {
  const catalog = await getAthleteCatalog();
  const searchParams = (await props.searchParams) ?? {};
  const packageId = safePackageId(searchParams.op_e2e_gallery_state);
  const demoEntries = isDemoModeEnabled(process.env)
    ? getDemoGalleryEntries()
    : undefined;

  return (
    <main className="grain relative min-h-screen overflow-hidden text-[var(--ink)]">
      <section className="relative grid gap-10 p-8 md:p-14 lg:p-16">
        <nav>
          <Link
            className="font-mono-op text-[11px] uppercase tracking-[0.14em] text-[var(--ink-dim)] hover:text-[var(--ink)]"
            href="/"
          >
            ← All athletes
          </Link>
        </nav>

        <header className="flex flex-col gap-6 border-b border-[var(--rule)] pb-8">
          <div className="op-eyebrow">
            <span className="bar" />
            <span>History · Participation record</span>
          </div>
          <h1 className="font-display text-[clamp(48px,8vw,96px)] leading-[0.9] tracking-[-0.01em] text-[var(--ink)]">
            Participation{" "}
            <em className="font-serif-display not-italic text-[var(--ember)]">
              <span className="italic">gallery</span>
            </em>
          </h1>
          <p className="max-w-2xl text-base leading-[1.55] text-[var(--ink-dim)]">
            Rebuild your on-chain participation history from the Kakera your
            wallet already owns.
          </p>
        </header>

        <GalleryPageClient
          catalog={catalog}
          demoEntries={demoEntries}
          packageId={packageId ?? ""}
        />
      </section>
    </main>
  );
}

function safePackageId(e2eGalleryState: string | undefined): string | null {
  if (shouldUseE2EGalleryConfigMissing(e2eGalleryState)) {
    return null;
  }

  try {
    const env = loadPublicEnv(process.env);
    return env.originalPackageId ?? env.packageId;
  } catch {
    return null;
  }
}

function shouldUseE2EGalleryConfigMissing(
  e2eGalleryState: string | undefined,
): boolean {
  return (
    process.env.NEXT_PUBLIC_E2E_STUB_WALLET === "1" &&
    e2eGalleryState === "config-missing"
  );
}
