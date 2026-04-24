export default function EnokiCallbackPage(): React.ReactElement {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-50">
      <div className="mx-auto grid max-w-lg gap-4 rounded-[1.75rem] border border-white/10 bg-white/5 p-8 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">
          Google Login
        </p>
        <h1 className="font-serif text-3xl text-white">
          Verifying authentication
        </h1>
        <p className="text-sm text-slate-300">
          This window closes automatically. If it does not close, wait here or
          close it manually.
        </p>
      </div>
    </main>
  );
}
