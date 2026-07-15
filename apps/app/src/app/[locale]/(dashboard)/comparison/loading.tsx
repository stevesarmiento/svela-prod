export default function ComparisonLoading() {
  const skeletonRows = ["row-1", "row-2", "row-3", "row-4", "row-5"];

  return (
    <div className="p-6">
      <div className="animate-pulse motion-reduce:animate-none space-y-6">
        <div className="h-8 w-56 rounded bg-zinc-950/10 dark:bg-white/10" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Chart column */}
          <div className="lg:col-span-5">
            <div className="h-[360px] rounded-[16px] border border-primary/5 bg-primary/5" />
          </div>

          {/* Table column */}
          <div className="lg:col-span-7">
            <div className="rounded-[10px] border border-primary/5 bg-primary/5 p-4 space-y-3">
              {skeletonRows.map((key) => (
                <div
                  key={key}
                  className="h-10 rounded bg-zinc-950/10 dark:bg-white/10"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
