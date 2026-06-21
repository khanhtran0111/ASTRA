/**
 * Realistic mock data for offline testing of the L&D Coordinator pipeline.
 *
 * Trainer data is modeled after the DS04_Internal_Trainer_List.csv patterns.
 * Training needs cover three scenarios:
 *   1. Happy path (trainer found, capacity OK)
 *   2. Skill not found (no internal trainer)
 *   3. Capacity exceeded (trainer exists but overloaded)
 */

import type { InternalTrainer, ScoredTrainingNeed } from './types.ts';

// ---------------------------------------------------------------------------
// Internal Trainer Pool
// ---------------------------------------------------------------------------

export const MOCK_TRAINERS: InternalTrainer[] = [
  {
    trainerId: 'TRN-001',
    expertise: ['Java', 'Spring Boot', 'Microservices'],
    availabilityHoursPerMonth: 8,
  },
  {
    trainerId: 'TRN-002',
    expertise: ['React', 'TypeScript', 'Next.js'],
    availabilityHoursPerMonth: 8,
  },
  {
    trainerId: 'TRN-003',
    expertise: ['Kubernetes', 'Docker', 'CI/CD', 'DevOps'],
    availabilityHoursPerMonth: 4,
  },
  {
    trainerId: 'TRN-004',
    expertise: ['Python', 'Machine Learning', 'Data Engineering'],
    availabilityHoursPerMonth: 8,
  },
  {
    trainerId: 'TRN-005',
    expertise: ['Agile', 'Scrum', 'Project Management'],
    availabilityHoursPerMonth: 4,
  },
];

// ---------------------------------------------------------------------------
// Scored Training Needs (pre-sorted by priorityScore DESC)
// ---------------------------------------------------------------------------

export const MOCK_TRAINING_NEEDS: ScoredTrainingNeed[] = [
  // --- Scenario 1: Happy path — Kubernetes trainer exists (TRN-003, 4h/month) ---
  // 12h course → 4h/month for 3 months = exactly fills TRN-003's capacity
  {
    needId: 'NEED-001',
    skillName: 'Kubernetes',
    priorityScore: 95,
    traineeIds: ['EMP-036', 'EMP-128', 'EMP-045', 'EMP-067', 'EMP-089'],
    estimatedHours: 12,
    targetQuarter: 'Q3_2026',
    evidence: {
      bodGoals: ['GOAL-2026-07'],
      projectIds: ['PRJ-009'],
      surveyIds: ['SUR_2025_Q4'],
    },
  },

  // --- Scenario 2: Happy path — React trainer exists (TRN-002, 8h/month) ---
  // 16h course → ~5.33h/month → ceil to 6h/month, within 8h cap
  {
    needId: 'NEED-002',
    skillName: 'React',
    priorityScore: 88,
    traineeIds: ['EMP-101', 'EMP-102', 'EMP-103', 'EMP-104'],
    estimatedHours: 16,
    targetQuarter: 'Q3_2026',
    evidence: {
      bodGoals: ['GOAL-2026-03'],
      projectIds: ['PRJ-011'],
      surveyIds: ['SUR_2025_Q4'],
    },
  },

  // --- Scenario 3: Skill NOT found — no Penetration Testing trainer ---
  {
    needId: 'NEED-003',
    skillName: 'Penetration Testing',
    priorityScore: 80,
    traineeIds: ['EMP-199', 'EMP-204', 'EMP-210', 'EMP-215', 'EMP-220'],
    estimatedHours: 24,
    targetQuarter: 'Q3_2026',
    evidence: {
      bodGoals: [],
      projectIds: ['PRJ-012'],
      surveyIds: ['SUR_2025_Q4'],
    },
  },

  // --- Scenario 4: Happy path — Python/ML trainer (TRN-004, 8h/month) ---
  {
    needId: 'NEED-004',
    skillName: 'Machine Learning',
    priorityScore: 75,
    traineeIds: ['EMP-301', 'EMP-302', 'EMP-303'],
    estimatedHours: 20,
    targetQuarter: 'Q4_2026',
    evidence: {
      bodGoals: ['GOAL-2026-10'],
      projectIds: ['PRJ-015'],
      surveyIds: [],
    },
  },

  // --- Scenario 5: Capacity EXCEEDED — DevOps/Kubernetes need, but TRN-003
  //     already used up by NEED-001 (higher priority) ---
  // This tests that the stateful capacity tracking works across assignments.
  {
    needId: 'NEED-005',
    skillName: 'Docker',
    priorityScore: 70,
    traineeIds: ['EMP-401', 'EMP-402'],
    estimatedHours: 12,
    targetQuarter: 'Q3_2026',
    evidence: {
      bodGoals: [],
      projectIds: ['PRJ-009'],
      surveyIds: [],
    },
  },

  // --- Scenario 6: Happy path — Agile trainer (TRN-005, 4h/month) ---
  // 8h course → ~2.67h/month → ceil to 3h/month, within 4h cap
  {
    needId: 'NEED-006',
    skillName: 'Scrum',
    priorityScore: 60,
    traineeIds: ['EMP-501', 'EMP-502', 'EMP-503', 'EMP-504', 'EMP-505', 'EMP-506'],
    estimatedHours: 8,
    targetQuarter: 'Q4_2026',
    evidence: {
      bodGoals: ['GOAL-2026-05'],
      projectIds: [],
      surveyIds: ['SUR_2025_Q4'],
    },
  },
];
