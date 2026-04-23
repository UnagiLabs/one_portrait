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
            ← デモホームへ
          </Link>
        </nav>

        <header className="grid gap-4 rounded-[2rem] border border-white/10 bg-white/6 p-8 shadow-2xl shadow-black/30 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.3em] text-amber-200/80">
            管理者
          </p>
          <h1 className="font-serif text-4xl text-white md:text-5xl">
            デモ管理コンソール
          </h1>
          <p className="max-w-3xl text-base leading-7 text-stone-200">
            先に athlete metadata を on-chain 登録し、その後にユニット作成、
            current unit の切り替え、finalize の再試行をこの 1
            ページで操作します。
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
