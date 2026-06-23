import { type Statement, toManifest } from '@seta/shared-rbac';

export const trainingRoadmapStatement = {
  'training-roadmap': ['read', 'write'],
} as const satisfies Statement;

const roleStatements = {
  'training-roadmap.manager': { 'training-roadmap': ['read', 'write'] },
  'training-roadmap.viewer': { 'training-roadmap': ['read'] },
} as const satisfies Record<string, Statement>;

export const trainingRoadmapRbac = toManifest(
  'training-roadmap',
  trainingRoadmapStatement,
  roleStatements,
  {
    'training-roadmap.manager': 'Generate, review, approve, and export training roadmaps',
    'training-roadmap.viewer': 'Read training roadmap evidence and QA results',
  },
);

export type TrainingRoadmapPermission = (typeof trainingRoadmapRbac.permissions)[number]['key'];
