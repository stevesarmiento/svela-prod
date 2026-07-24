const SKELETON_ROWS = ["row-1", "row-2", "row-3", "row-4", "row-5", "row-6"];

export default function Loading() {
  return (
    <div className="p-6">
      <div className="animate-pulse motion-reduce:animate-none space-y-6">
        <div className="h-8 w-56 rounded bg-zinc-950/10 dark:bg-white/10" />
        <div className="rounded-[10px] border border-primary/5 bg-primary/5 p-4 space-y-3">
          {SKELETON_ROWS.map((key) => (
            <div
              key={key}
              className="h-10 rounded bg-zinc-950/10 dark:bg-white/10"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

