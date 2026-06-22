import { Card, CardContent } from '@seta/shared-ui';
import { ArrowRight, Loader2, Route, ShieldCheck } from 'lucide-react';

export function RoadmapGenerationStatus() {
  return (
    <Card role="status" aria-label="Generating roadmap" aria-live="polite">
      <CardContent className="py-8">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
          <div className="relative grid size-14 place-items-center rounded-full border border-primary-border bg-primary-tint">
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/10 motion-reduce:animate-none" />
            <Loader2
              className="relative size-7 animate-spin text-primary motion-reduce:animate-none"
              aria-hidden
            />
          </div>
          <div>
            <div className="font-medium text-ink">Agent workflow in progress</div>
            <p className="mt-1 text-body-sm text-ink-subtle">
              Agent 1 is building the draft and Agent 2 is checking evidence, risk, and revision
              requirements.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 text-caption">
            <span className="flex items-center gap-2 rounded-full border border-primary-border bg-primary-tint px-3 py-1.5 text-primary-ink">
              <Route className="size-3.5" aria-hidden />
              Generate draft
              <span className="size-1.5 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
            </span>
            <ArrowRight className="size-4 text-ink-subtle" aria-hidden />
            <span className="flex items-center gap-2 rounded-full border border-hairline bg-canvas px-3 py-1.5 text-ink-subtle">
              <ShieldCheck className="size-3.5" aria-hidden />
              QA quality gate
              <span className="flex gap-1" aria-hidden>
                <span className="size-1 animate-bounce rounded-full bg-ink-subtle [animation-delay:-0.2s] motion-reduce:animate-none" />
                <span className="size-1 animate-bounce rounded-full bg-ink-subtle [animation-delay:-0.1s] motion-reduce:animate-none" />
                <span className="size-1 animate-bounce rounded-full bg-ink-subtle motion-reduce:animate-none" />
              </span>
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
