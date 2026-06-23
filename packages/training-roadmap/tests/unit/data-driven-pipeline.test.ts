import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  auditDataDrivenRoadmap,
  runDataDrivenCoordinator,
} from '../../src/backend/domain/data-driven-pipeline.ts';

const directories: string[] = [];

function fixtureDir(options: { trainerSkill?: string; trainerCapacity?: number } = {}): string {
  const directory = mkdtempSync(join(tmpdir(), 'training-roadmap-data-first-'));
  directories.push(directory);
  writeFileSync(
    join(directory, 'DS01_Employee_Skill_Profile.csv'),
    [
      'Staff_ID,Full_Name,Job_Title,Team,Skill_Set,Level,Development_Needs',
      'EMP-X,Ada,Software Developer,Platform,ReactJS; NodeJS,Intermediate,Security Testing',
      'EMP-Y,Lin,Software Developer,AI,Python,Beginner,Prompt Engineering',
    ].join('\n'),
  );
  writeFileSync(
    join(directory, 'DS02_Project_Roadmap.csv'),
    ['Project_Code,Technologies,Schedule', 'PRJ-X,Security Test,Q3 2026'].join('\n'),
  );
  writeFileSync(
    join(directory, 'DS03_Training_Need_Survey.csv'),
    [
      'Response_ID,Staff_ID,Requested_Training,Priority',
      'SUR-X,EMP-X,Security Testing,High',
      'SUR-Y,EMP-Y,Prompt Engineering,Medium',
    ].join('\n'),
  );
  writeFileSync(
    join(directory, 'DS04_Internal_Trainer_List.csv'),
    [
      'Coach_ID,Skill_Areas,Monthly_Capacity',
      `TRN-X,${options.trainerSkill ?? 'Security Tests'},${options.trainerCapacity ?? 1}`,
    ].join('\n'),
  );
  writeFileSync(
    join(directory, 'DS05_BOD_Training_Goals.csv'),
    ['Objective_ID,Objective,Quarter', 'GOAL-X,Strategic Security Testing capability,Q3 2026'].join(
      '\n',
    ),
  );
  writeFileSync(
    join(directory, 'market_trends.csv'),
    ['Trend_ID,Skill,Signal', 'TREND-X,Quantum Computing,High'].join('\n'),
  );
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('data-driven training roadmap pipeline', () => {
  it('discovers new skills and alternate column names without topic-specific code', () => {
    const result = runDataDrivenCoordinator({
      dataDir: fixtureDir(),
      runId: 'data-first-run',
      userPrompt: 'Create a Q3/2026 roadmap from all available evidence.',
    });

    expect(result.coverageReport.totalRecordsBySource).toMatchObject({
      DS01: 2,
      DS02: 1,
      DS03: 2,
      DS04: 1,
      DS05: 1,
      MARKET: 1,
    });
    expect(result.ontology.map((skill) => skill.displayName)).toEqual(
      expect.arrayContaining(['ReactJS', 'Prompt Engineering', 'Security Testing']),
    );
    expect(result.candidates.map((candidate) => candidate.topic)).toEqual(
      expect.arrayContaining(['Prompt Engineering', 'Security Testing']),
    );
    expect(result.unselectedCandidates).toContainEqual(
      expect.objectContaining({
        candidate: 'Quantum Computing',
        reasonDropped: 'NO_INTERNAL_CONTEXT',
      }),
    );
  });

  it('continues with remaining sources when one CSV is malformed', () => {
    const dataDir = fixtureDir();
    writeFileSync(
      join(dataDir, 'DS05_BOD_Training_Goals.csv'),
      'Objective_ID,Objective,Quarter\nGOAL-X,"unterminated,Q3 2026',
    );

    const result = runDataDrivenCoordinator({
      dataDir,
      runId: 'malformed-run',
      userPrompt: 'Create a Security Testing roadmap.',
    });

    expect(result.inventory.find((source) => source.sourceId === 'DS05')).toMatchObject({
      validRows: 0,
      warnings: [expect.stringContaining('malformed')],
    });
    expect(result.roadmap.initiatives.map((item) => item.topic)).toContain('Security Testing');
  });

  it('uses DS01 trainees and a partial-capacity alias trainer instead of external fallback', () => {
    const result = runDataDrivenCoordinator({
      dataDir: fixtureDir(),
      runId: 'security-run',
      userPrompt: 'Create one Q3/2026 Security Testing initiative for Software Developer.',
    });
    const initiative = result.roadmap.initiatives[0];

    expect(result.roadmap.initiatives).toHaveLength(1);
    expect(initiative).toMatchObject({
      topic: 'Security Testing',
      format: 'BLENDED_INTERNAL_SELF_STUDY',
      selectedTrainer: 'TRN-X',
      trainees: [expect.objectContaining({ employeeId: 'EMP-X', matchedGap: 'Security Testing' })],
      trainerCandidates: [
        expect.objectContaining({
          trainerId: 'TRN-X',
          capacityStatus: 'PARTIAL',
        }),
      ],
    });
    expect(initiative?.evidenceRefs.some((ref) => ref.sourceId === 'DS01')).toBe(true);
    expect(initiative?.evidenceRefs.some((ref) => ref.sourceId === 'DS02')).toBe(true);
  });

  it('limits initiative DS01 evidence to the trainees actually selected', () => {
    const dataDir = fixtureDir();
    writeFileSync(
      join(dataDir, 'DS01_Employee_Skill_Profile.csv'),
      [
        'Staff_ID,Full_Name,Job_Title,Team,Skill_Set,Level,Development_Needs',
        'EMP-X,Ada,Software Developer,Platform,ReactJS,Intermediate,Security Testing',
        'EMP-Z,Grace,Software Developer,Platform,TypeScript,Intermediate,Security Testing',
      ].join('\n'),
    );

    const result = runDataDrivenCoordinator({
      dataDir,
      runId: 'selected-evidence-run',
      userPrompt:
        'Create one Q3/2026 Security Testing initiative for Software Developer with up to 1 trainee.',
    });
    const initiative = result.roadmap.initiatives[0];
    const selectedIds = new Set(initiative?.trainees.map((trainee) => trainee.employeeId));
    const ds01EvidenceIds = initiative?.evidenceRefs
      .filter((ref) => ref.sourceId === 'DS01')
      .map((ref) => ref.rowId);

    expect(selectedIds.size).toBe(1);
    expect(new Set(ds01EvidenceIds)).toEqual(selectedIds);
  });

  it('honors an exact initiative count and a Requested topics section', () => {
    const dataDir = fixtureDir();
    writeFileSync(
      join(dataDir, 'DS01_Employee_Skill_Profile.csv'),
      [
        'Staff_ID,Full_Name,Job_Title,Team,Skill_Set,Level,Development_Needs',
        'EMP-X,Ada,Software Developer,Platform,ReactJS,Intermediate,Security Testing',
        'EMP-Y,Lin,Software Developer,AI,Python,Beginner,Prompt Engineering',
        'EMP-Z,Grace,Software Developer,Platform,TypeScript,Intermediate,Containerization',
      ].join('\n'),
    );
    writeFileSync(
      join(dataDir, 'DS02_Project_Roadmap.csv'),
      [
        'Project_Code,Technologies,Schedule',
        'PRJ-X,Security Testing,Q3 2026',
        'PRJ-Y,Prompt Engineering,Q3 2026',
        'PRJ-Z,Containerization,Q3 2026',
      ].join('\n'),
    );

    const result = runDataDrivenCoordinator({
      dataDir,
      runId: 'requested-topics-run',
      userPrompt: [
        'Create exactly 2 Q3/2026 training initiatives for Software Developer.',
        '',
        'Requested topics:',
        '- Security Testing',
        '- Prompt Engineering',
        '',
        'Constraints:',
        '- Only include initiatives backed by DS01 trainee gaps.',
        '- Do not add extra topics.',
      ].join('\n'),
    });

    expect(result.roadmap.initiatives).toHaveLength(2);
    expect(result.roadmap.initiatives.map((initiative) => initiative.topic).sort()).toEqual([
      'Prompt Engineering',
      'Security Testing',
    ]);
    expect(result.unselectedCandidates).toContainEqual(
      expect.objectContaining({
        candidate: 'Containerization',
        reasonDropped: 'OUTSIDE_PROMPT_SCOPE',
      }),
    );
  });

  it('uses a reasoned HITL fallback when a P1 skill has no internal trainer', () => {
    const result = runDataDrivenCoordinator({
      dataDir: fixtureDir({ trainerSkill: 'Unrelated Coaching' }),
      runId: 'fallback-run',
      userPrompt: 'Create one Q3/2026 Security Testing initiative for Software Developer.',
    });
    const initiative = result.roadmap.initiatives[0];

    expect(initiative).toMatchObject({
      priority: 'P1',
      format: 'EXTERNAL_TRAINER',
      fallbackReason: 'ERR_NO_INTERNAL_SKILL',
      requiresHumanApproval: true,
      selectedTrainer: null,
    });
  });

  it('blocks roadmap items without DS01 trainees or evidence', () => {
    const audit = auditDataDrivenRoadmap({
      inventory: [],
      coverageReport: {
        totalRecordsBySource: {},
        validRecordsBySource: {},
        candidateCount: 1,
        selectedCount: 1,
        droppedCount: 0,
        unmatchedSkills: [],
        unmatchedTraineeRows: [],
        unmatchedTrainerRows: [],
        warnings: [],
      },
      initiatives: [
        {
          id: 'item-1',
          topic: 'Unsupported Skill',
          canonicalSkillId: 'skill-unsupported',
          priority: 'P1',
          score: 90,
          quarter: 'Q3 2026',
          weeks: { startWeek: 1, endWeek: 4, durationWeeks: 4 },
          totalHours: 16,
          trainerContactHours: 4,
          selfStudyHours: 8,
          labHours: 4,
          format: 'SELF_STUDY',
          trainerDecision: 'No trainer',
          trainerCandidates: [],
          selectedTrainer: null,
          trainees: [],
          objectives: [],
          prerequisites: [],
          evaluationCriteria: 'Assessment',
          evidenceRefs: [],
          scoreBreakdown: {
            bodAlignment: 0,
            projectUrgency: 0,
            traineeGapImpact: 0,
            surveyDemand: 0,
            feasibility: 0,
            marketTrend: 0,
            riskPenalty: 0,
          },
          selectionReason: 'Invalid fixture',
          risks: [],
          requiresHumanApproval: false,
        },
      ],
    });

    expect(audit.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ issueCode: 'NO_TRAINEE_EVIDENCE', blockingLevel: 'HIGH' }),
        expect.objectContaining({ issueCode: 'MISSING_EVIDENCE_REFS', blockingLevel: 'HIGH' }),
      ]),
    );
    expect(audit.revisionActions).toContainEqual(
      expect.objectContaining({ requiredToolToRerun: 'allocateTraineesTool' }),
    );
  });
});
