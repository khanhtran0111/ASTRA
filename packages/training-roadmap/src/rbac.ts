import { type Statement, toManifest } from '@seta/shared-rbac';

export const trainingRoadmapStatement = {} as const satisfies Statement;

const roleStatements = {} as const satisfies Record<string, Statement>;

export const trainingRoadmapRbac = toManifest(
  'training-roadmap',
  trainingRoadmapStatement,
  roleStatements,
  {},
);

export type TrainingRoadmapPermission = (typeof trainingRoadmapRbac.permissions)[number]['key'];
