import { describe, expect, it } from 'vitest';
import type { DataDrivenCoordinatorResult } from '../../src/backend/domain/data-driven-pipeline.ts';
import {
  toDraftRoadmapOutput,
  toRoadmapOutputAgent,
} from '../../src/backend/domain/to-roadmap-output-agent.ts';

const ds01Evidence = {
  sourceId: 'DS01' as const,
  rowId: 'EMP-001',
  field: 'Skill_Gap',
  value: 'Security Testing',
  reason: 'Direct employee skill-gap evidence.',
};

const snapshot: DataDrivenCoordinatorResult = {
  runId: 'run-data-first',
  inventory: [
    {
      sourceId: 'DS01',
      fileName: 'DS01_Employee_Skill_Profile.csv',
      rowCount: 1,
      validRows: 1,
      invalidRows: 0,
      skippedRows: 0,
      detectedColumns: ['Employee_ID', 'Skill_Gap'],
      warnings: [],
    },
  ],
  evidenceIndex: [],
  ontology: [],
  candidates: [],
  roadmap: {
    initiatives: [
      {
        id: 'initiative-security-testing',
        topic: 'Security Testing',
        canonicalSkillId: 'skill-security-testing',
        priority: 'P1',
        score: 92,
        quarter: 'Q3 2026',
        weeks: { startWeek: 1, endWeek: 6, durationWeeks: 6 },
        totalHours: 24,
        trainerContactHours: 8,
        selfStudyHours: 8,
        labHours: 8,
        format: 'BLENDED_INTERNAL_SELF_STUDY',
        trainerDecision: 'TRN-001 mentors the blended plan.',
        trainerCandidates: [
          {
            trainerId: 'TRN-001',
            fitScore: 0.9,
            matchedSkills: ['Security Testing'],
            missingSkills: [],
            capacityStatus: 'PARTIAL',
            availabilityHoursPerMonth: 8,
            evidenceRefs: [
              {
                sourceId: 'DS04',
                rowId: 'TRN-001',
                field: 'Expertise',
                value: 'Security Testing',
                reason: 'Trainer expertise evidence.',
              },
            ],
          },
        ],
        selectedTrainer: 'TRN-001',
        trainees: [
          {
            employeeId: 'EMP-001',
            role: 'Software Engineer',
            proficiency: 'Intermediate',
            matchedGap: 'Security Testing',
            reason: 'The recorded gap matches the initiative.',
            evidenceRefs: [ds01Evidence],
          },
        ],
        objectives: ['Execute a security test plan.'],
        prerequisites: ['Testing fundamentals'],
        evaluationCriteria: 'Pass the practical assessment.',
        evidenceRefs: [
          ds01Evidence,
          {
            sourceId: 'MARKET',
            rowId: 'TREND-001',
            field: 'Signal',
            value: 'High',
            reason: 'External trend context.',
          },
        ],
        scoreBreakdown: {
          bodAlignment: 20,
          projectUrgency: 20,
          traineeGapImpact: 20,
          surveyDemand: 15,
          feasibility: 10,
          marketTrend: 7,
          riskPenalty: 0,
        },
        selectionReason: 'Selected from internal demand evidence.',
        risks: [],
        requiresHumanApproval: false,
      },
    ],
  },
  coverageReport: {
    totalRecordsBySource: { DS01: 1 },
    validRecordsBySource: { DS01: 1 },
    candidateCount: 1,
    selectedCount: 1,
    droppedCount: 0,
    unmatchedSkills: [],
    unmatchedTraineeRows: [],
    unmatchedTrainerRows: [],
    warnings: [],
  },
  unselectedCandidates: [],
  toolTrace: [{ tool: 'generateRoadmapTool', status: 'completed', detail: 'Selected one item.' }],
};

describe('toRoadmapOutputAgent', () => {
  it('maps the data-first snapshot into the canonical rich Agent 1 artifact', () => {
    const artifact = toRoadmapOutputAgent({
      snapshot,
      userPrompt: 'Build a Q3 2026 Security Testing roadmap.',
      feedback: 'Keep the blended delivery plan.',
    });

    expect(artifact).toMatchObject({
      runId: 'run-data-first',
      request: {
        userPrompt:
          'Build a Q3 2026 Security Testing roadmap.\n\nReviewer feedback:\nKeep the blended delivery plan.',
      },
      revisionCount: 0,
      dataInventory: snapshot.inventory,
      dataCoverageReport: snapshot.coverageReport,
      toolTrace: snapshot.toolTrace,
    });
    expect(artifact.executionLog).toContain('Applied human feedback to the data-first run.');
    expect(artifact.initiatives[0]).toMatchObject({
      topic: 'Security Testing',
      trainerName: 'TRN-001',
      format: 'INTERNAL_TRAINING',
      deliveryFormat: 'BLENDED_INTERNAL_SELF_STUDY',
      targetTrainees: ['EMP-001'],
      traineeDetails: [
        expect.objectContaining({
          employeeId: 'EMP-001',
          position: 'Software Engineer',
          proficiencyLevel: 'Intermediate',
          matchedSkillGap: ['Security Testing'],
        }),
      ],
      totalHours: 24,
      trainerContactHours: 8,
      selfStudyHours: 8,
      labHours: 8,
      alignmentType: 'BOD_AND_SURVEY_ONLY',
    });
    expect(artifact.initiatives[0]?.evidence).toEqual(
      [ds01Evidence].map((evidence) => ({
        source: evidence.sourceId,
        recordId: evidence.rowId,
        field: evidence.field,
        value: evidence.value,
        reason: evidence.reason,
      })),
    );
  });

  it('preserves a visible draft roadmap view from the original data-first snapshot', () => {
    const draft = toDraftRoadmapOutput(snapshot, 'RM-test');

    expect(draft).toMatchObject({
      roadmapId: 'RM-test',
      status: 'DRAFT',
      quarters: {
        Q3_2026: [
          {
            classId: 'initiative-security-testing',
            topic: 'Security Testing',
            priorityScore: 92,
            traineeCount: 1,
            trainees: ['EMP-001'],
            resource: {
              trainerId: 'TRN-001',
              isExternalRequired: false,
              fallbackReason: null,
            },
          },
        ],
      },
    });
  });

  it('adds a complete deterministic fallback plan when no internal trainer is selected', () => {
    const externalSnapshot = structuredClone(snapshot);
    const initiative = externalSnapshot.roadmap.initiatives[0];
    if (!initiative) throw new Error('Expected test initiative');
    initiative.format = 'EXTERNAL_TRAINER';
    initiative.selectedTrainer = null;
    initiative.trainerCandidates = [];
    initiative.fallbackReason = 'ERR_NO_INTERNAL_SKILL';
    initiative.requiresHumanApproval = true;

    const source = toRoadmapOutputAgent({
      snapshot: externalSnapshot,
      userPrompt: 'Create one Security Testing initiative.',
    });

    expect(source.initiatives[0]).toMatchObject({
      trainerName: null,
      fallbackReason: 'ERR_NO_INTERNAL_SKILL',
      fallbackPlan: {
        pic: expect.any(String),
        materials: expect.arrayContaining([expect.any(String)]),
        milestones: expect.arrayContaining([
          expect.objectContaining({ week: expect.any(Number), deliverable: expect.any(String) }),
        ]),
        estimatedHours: 24,
        evaluationCriteria: expect.any(String),
      },
    });
  });
});
