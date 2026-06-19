import type { RouteBuildDeps, SessionEnv } from '@seta/core';
import { Hono } from 'hono';
import { trainingRoadmapRoutes } from './routes.ts';

export { trainingRoadmapRoutes } from './routes.ts';

export function buildTrainingRoadmapRoutes(_deps: RouteBuildDeps): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  app.route('/api/training-roadmap', trainingRoadmapRoutes);
  return app;
}
