import type { RouteBuildDeps, SessionEnv } from '@seta/core';
import { Hono } from 'hono';
import { buildTrainingRoadmapRouteHandlers } from './routes.ts';

export { buildTrainingRoadmapRouteHandlers } from './routes.ts';

export function buildTrainingRoadmapRoutes(deps: RouteBuildDeps): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  app.route('/api/training-roadmap', buildTrainingRoadmapRouteHandlers({ agents: deps.agents }));
  return app;
}
