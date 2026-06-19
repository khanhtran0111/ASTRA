import { createFileRoute } from '@tanstack/react-router';
import { TrainingRoadmapDemoPage } from '@/modules/training-roadmap/pages/training-roadmap-demo-page';

export const Route = createFileRoute('/_authed/training-roadmap')({
  component: TrainingRoadmapDemoPage,
});
