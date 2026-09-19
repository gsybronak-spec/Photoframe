export default function AdminLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6" aria-busy="true">
      <span className="sr-only">Loading admin…</span>
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 animate-pulse rounded-2xl bg-white/70" />
        <div className="space-y-2">
          <div className="h-7 w-48 animate-pulse rounded-full bg-white/70" />
          <div className="h-3 w-64 animate-pulse rounded-full bg-white/60" />
        </div>
      </div>
      <div className="mt-8 h-14 animate-pulse rounded-3xl bg-white/60" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="glass rounded-3xl p-5">
            <div className="mx-auto h-5 w-5 animate-pulse rounded-full bg-white/70" />
            <div className="mx-auto mt-3 h-6 w-16 animate-pulse rounded-full bg-white/70" />
            <div className="mx-auto mt-2 h-3 w-20 animate-pulse rounded-full bg-white/60" />
          </div>
        ))}
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="glass rounded-3xl p-6">
            <div className="h-5 w-32 animate-pulse rounded-full bg-white/70" />
            <div className="mt-4 space-y-3">
              {[0, 1, 2, 3].map((j) => (
                <div key={j} className="h-3 w-full animate-pulse rounded-full bg-white/60" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
