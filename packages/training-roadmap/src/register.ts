import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry } from '@seta/core';
import * as schema from './backend/db/schema.ts';
import { buildTrainingRoadmapRoutes } from './backend/http/index.ts';
import { TRAINING_ROADMAP_EVENTS } from './events.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function registerTrainingRoadmapContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'training-roadmap',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    events: TRAINING_ROADMAP_EVENTS,
    routes: { mountAt: '/', build: buildTrainingRoadmapRoutes },
  });
}
