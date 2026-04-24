import Link from "next/link";

import { loadAdminAthletes } from "../../lib/admin/athletes";
import { getAdminHealth } from "../../lib/admin/health";

import { AdminClient } from "./admin-client";

export const dynamic = "force-dynamic";

export default async function AdminPage(): Promise<React.ReactElement> {
  const [athletes, health] = await Promise.all([
    loadInitialAthletes(),
    getAdminHealth(),
  ]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#2e2210,_#13100b_55%,_#060504)] px-6 py-16 text-stone-100">
      <div className="mx-auto grid max-w-6xl gap-8">
        <nav>
          <Link
            className="text-sm uppercase tracking-[0.3em] text-amber-200/80 hover:text-amber-100"
            href="/"
          >
            ← Demo home
          </Link>
        </nav>

        <header className="grid gap-4 rounded-[2rem] border border-white/10 bg-white/6 p-8 shadow-2xl shadow-black/30 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.3em] text-amber-200/80">
            Admin
          </p>
          <h1 className="font-serif text-4xl text-white md:text-5xl">
            Demo admin console
          </h1>
          <p className="max-w-3xl text-base leading-7 text-stone-200">
            Choose normal or demo mode when creating a unit, and adjust the real
            submission count for the displayed 2,000 tiles. You can also check
            existing unit status and retry finalize from this page.
          </p>
        </header>

        <AdminClient initialAthletes={athletes} initialHealth={health} />
      </div>
    </main>
  );
}

async function loadInitialAthletes() {
  try {
    return await loadAdminAthletes();
  } catch (error) {
    console.error("Failed to load admin athletes", error);
    return [];
  }
}
