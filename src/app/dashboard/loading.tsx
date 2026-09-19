export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your studio…</span>

      <div className="glass rounded-[2rem] p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-4">
          <div className="h-16 w-16 animate-pulse rounded-3xl bg-white/70" />
          <div className="flex-1 space-y-3">
            <div className="h-3 w-24 animate-pulse rounded-full bg-white/70" />
            <div className="h-8 w-52 animate-pulse rounded-full bg-white/70" />
            <div className="h-3 w-64 animate-pulse rounded-full bg-white/60" />
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="glass rounded-3xl p-5">
            <div className="flex items-center gap-4">
              <div className="h-11 w-11 animate-pulse rounded-2xl bg-white/70" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-16 animate-pulse rounded-full bg-white/70" />
                <div className="h-3 w-24 animate-pulse rounded-full bg-white/60" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="h-7 w-40 animate-pulse rounded-full bg-white/70" />
          <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="glass overflow-hidden rounded-3xl">
                <div className="aspect-[4/5] w-full animate-pulse bg-white/60" />
                <div className="space-y-2 p-4">
                  <div className="h-4 w-28 animate-pulse rounded-full bg-white/70" />
                  <div className="h-3 w-36 animate-pulse rounded-full bg-white/60" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-6">
          {[0, 1].map((i) => (
            <div key={i} className="glass rounded-3xl p-6">
              <div className="h-5 w-32 animate-pulse rounded-full bg-white/70" />
              <div className="mt-4 space-y-3">
                {[0, 1, 2].map((j) => (
                  <div key={j} className="h-3 w-full animate-pulse rounded-full bg-white/60" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
