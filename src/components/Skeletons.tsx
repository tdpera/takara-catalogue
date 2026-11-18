/** Shapes shown while a page loads on a slow connection (the real page streams in after). */
function HeaderSkeleton() {
  return (
    <div className="border-b border-line bg-surface">
      <div className="mx-auto max-w-5xl space-y-3 px-4 pt-3 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="skeleton size-8 rounded-full" />
          <div className="skeleton h-6 w-48" />
          <div className="skeleton ms-auto h-11 w-24 rounded-full" />
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="skeleton h-7 w-20 rounded-full" />
          ))}
        </div>
      </div>
      <div className="mx-auto flex max-w-5xl gap-4 px-4 pb-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-5 flex-1" />
        ))}
      </div>
    </div>
  );
}

export function GridSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label}>
      <HeaderSkeleton />
      <div className="mx-auto max-w-5xl space-y-4 px-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="skeleton h-8 w-40" />
          <div className="skeleton h-11 w-32" />
        </div>
        <div className="skeleton h-11 w-full" />
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] sm:gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="overflow-hidden rounded-2xl border border-line bg-surface">
              <div className="skeleton aspect-square rounded-none" />
              <div className="space-y-2 p-3">
                <div className="skeleton h-4 w-4/5" />
                <div className="skeleton h-3 w-1/2" />
                <div className="skeleton h-6 w-2/3" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function DetailSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label}>
      <HeaderSkeleton />
      <div className="mx-auto grid max-w-5xl gap-6 px-4 pt-6 md:grid-cols-2">
        <div className="skeleton aspect-square w-full max-w-[32rem] rounded-2xl" />
        <div className="space-y-4">
          <div className="skeleton h-9 w-3/4" />
          <div className="flex gap-2">
            <div className="skeleton h-7 w-14 rounded-full" />
            <div className="skeleton h-7 w-20 rounded-full" />
            <div className="skeleton h-7 w-24 rounded-full" />
          </div>
          <div className="skeleton h-64 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

export function PlainSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="mx-auto max-w-5xl space-y-4 px-4 pt-6">
      <div className="skeleton h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="skeleton aspect-square w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export function PageSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label}>
      <HeaderSkeleton />
      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-40 w-full rounded-2xl" />
        <div className="skeleton h-40 w-full rounded-2xl" />
      </div>
    </div>
  );
}
