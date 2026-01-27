export default function Loading() {
  return (
    <div className="p-6">
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-44 rounded bg-zinc-950/10 dark:bg-white/10" />
        <div className="h-96 rounded-[20px] bg-zinc-950/10 dark:bg-white/10" />
        <div className="grid gap-6 md:grid-cols-2">
          <div className="h-64 rounded-[20px] bg-zinc-950/10 dark:bg-white/10" />
          <div className="h-64 rounded-[20px] bg-zinc-950/10 dark:bg-white/10" />
        </div>
      </div>
    </div>
  );
}

