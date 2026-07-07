/**
 * FeedSkeleton — the loading state of the infinite stream (design direction
 * v2.1 §8.7): TWO static skeleton post cards (v2 §6 bans shimmer) that
 * replace the sentinel row while a batch is fetching. Every block's height
 * comes from the same paddings/aspect-ratio as a real PostCard, and the pair
 * is appended strictly BELOW existing content — nothing in-viewport ever
 * shifts (CLS 0). aria-hidden: purely decorative; the aria-live region owned
 * by FeedStream announces the outcome.
 *
 * Client-safe by construction (no directives, no server imports) — rendered
 * only by FeedStream.
 */

function SkeletonBar({ className }: { className: string }) {
  return <div className={`rounded-[4px] ${className}`} />
}

function SkeletonPostCard() {
  return (
    <div className="overflow-hidden border-y border-border bg-surface sm:rounded-[16px] sm:border sm:shadow-[0_1px_2px_rgba(16,22,31,0.06),0_1px_3px_rgba(16,22,31,0.04)]">
      {/* Header row — 40px disc + two bars (120×14, 80×12), padding 12×16. */}
      <div className="flex items-center gap-2.5 px-4 py-3">
        <div className="h-10 w-10 shrink-0 rounded-full bg-accent-bg" />
        <div className="flex flex-col gap-1.5">
          <SkeletonBar className="h-3.5 w-[120px] bg-accent-bg" />
          <SkeletonBar className="h-3 w-20 bg-accent-bg" />
        </div>
      </div>
      {/* Media block — aspect-video, §5.3 placeholder gradient. */}
      <div className="aspect-video bg-[linear-gradient(135deg,var(--color-accent-bg),var(--color-accent-bg-strong))]" />
      {/* Three text bars — 100% / 92% / 56% × 16px. */}
      <div className="flex flex-col gap-2 px-4 py-4">
        <SkeletonBar className="h-4 w-full bg-accent-bg-strong" />
        <SkeletonBar className="h-4 w-[92%] bg-accent-bg-strong" />
        <SkeletonBar className="h-4 w-[56%] bg-accent-bg-strong" />
      </div>
    </div>
  )
}

/** The §8.7 skeleton pair — same inter-card gap rules as the stream (§8.2). */
export function FeedSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2 sm:gap-4">
      <SkeletonPostCard />
      <SkeletonPostCard />
    </div>
  )
}
