/** Sticky day label above a run of feed cards ("Today", "Yesterday", …). */
export function FeedDateHeader({ label }: { label: string }) {
  return (
    <div className="sticky relative top-4 z-30 py-2 text-xl font-medium text-white">
      <span className="text-white z-[1] font-bold">{label}</span>
      <div className="z-[-1] absolute top-[-20px] h-[80px] inset-0 pointer-events-none bg-gradient-to-b from-white via-white/50 dark:via-background/90 to-transparent dark:from-background" />
    </div>
  );
}
