import { getAthleteCatalog } from "../lib/catalog";
import { publicEnvKeys } from "../lib/env";

export default async function HomePage() {
  const catalog = await getAthleteCatalog();
  const featuredAthlete = catalog[0];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#15366d,_#071120_55%,_#02060d)] px-6 py-16 text-slate-50">
      <div className="mx-auto flex max-w-5xl flex-col gap-10">
        <section className="grid gap-6 rounded-[2rem] border border-white/10 bg-white/6 p-8 shadow-2xl shadow-black/30 backdrop-blur">
          <p className="text-sm uppercase tracking-[0.4em] text-cyan-200/80">
            one portrait
          </p>
          <div className="grid gap-4">
            <h1 className="max-w-3xl font-serif text-5xl leading-tight text-white md:text-6xl">
              500 faces, one reveal.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-200">
              Next.js workspace is ready. The first waiting room can now be
              built on top of the athlete catalog and public env loader.
            </p>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-[1.75rem] border border-white/10 bg-slate-950/60 p-7">
            <p className="text-sm uppercase tracking-[0.3em] text-amber-300/80">
              Featured unit
            </p>
            {featuredAthlete ? (
              <>
                <h2 className="mt-4 text-3xl font-semibold text-white">
                  {featuredAthlete.displayName}
                </h2>
                <dl className="mt-6 grid gap-3 text-sm text-slate-200">
                  <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-3">
                    <dt className="text-slate-400">Catalog slug</dt>
                    <dd>{featuredAthlete.slug}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-3">
                    <dt className="text-slate-400">Athlete public id</dt>
                    <dd>{featuredAthlete.athletePublicId}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="mt-4 text-slate-300">
                Athlete catalog is empty. Populate
                <code className="mx-1 font-mono">
                  apps/web/src/data/athlete-catalog.ts
                </code>
                to show this card.
              </p>
            )}
          </article>

          <article className="rounded-[1.75rem] border border-cyan-300/20 bg-cyan-300/8 p-7">
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-200">
              Required public env
            </p>
            <ul className="mt-4 grid gap-3">
              {publicEnvKeys.map((key) => (
                <li
                  key={key}
                  className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 font-mono text-sm text-cyan-100"
                >
                  {key}
                </li>
              ))}
            </ul>
          </article>
        </section>
      </div>
    </main>
  );
}
