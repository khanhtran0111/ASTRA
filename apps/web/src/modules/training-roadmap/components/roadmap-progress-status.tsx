import { Card, CardContent } from '@seta/shared-ui';
import { Loader2 } from 'lucide-react';

const content = {
  generate: {
    label: 'Generating roadmap',
    title: 'Generating your roadmap',
    description: 'Building the training plan and validating its evidence and quality.',
  },
  revision: {
    label: 'Updating roadmap',
    title: 'Updating your roadmap',
    description: 'Applying your feedback and validating the revised training plan.',
  },
} as const;

export function RoadmapProgressStatus({ mode }: { mode: keyof typeof content }) {
  const status = content[mode];

  return (
    <Card role="status" aria-label={status.label} aria-live="polite">
      <CardContent className="flex items-center gap-4 py-5">
        <div className="relative grid size-11 shrink-0 place-items-center rounded-full border border-primary-border bg-primary-tint">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/10 motion-reduce:animate-none" />
          <Loader2
            className="relative size-5 animate-spin text-primary motion-reduce:animate-none"
            aria-hidden
          />
        </div>
        <div>
          <div className="font-medium text-ink">{status.title}</div>
          <p className="mt-1 text-body-sm text-ink-subtle">{status.description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
