import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { QaInput } from '../qa/qa-validate-roadmap.ts';

const initiativeSchema = z.object({
  id: z.string().min(1),
  topic: z.string().min(1),
  priority: z.enum(['P1', 'P2', 'P3']),
  score: z.number(),
  quarter: z.string().min(1),
  targetTrainees: z.array(z.string()),
  trainerName: z.string().nullable(),
  format: z.enum([
    'EXTERNAL_TRAINER',
    'GROUP_STUDY',
    'ON_JOB_TRAINING',
    'ONLINE_COURSE',
    'SEMINAR_SHARING',
  ]),
  formatExplanation: z.string().min(1),
  estimatedHours: z.number().positive(),
  evidence: z.array(z.string()),
  fallbackReason: z.string().optional(),
});

const roadmapOutputAgentSchema = z.object({
  runId: z.string().min(1),
  executionLog: z.array(z.string()),
  initiatives: z.array(initiativeSchema).min(1),
});

export type RoadmapOutputAgent = z.infer<typeof roadmapOutputAgentSchema>;

const normalizedDataSchema = z.object({
  employees: z.array(
    z.object({
      employee_id: z.string(),
      self_reported_gaps: z.array(z.string()),
    }),
  ),
  trainers: z.array(
    z.object({
      trainer_id: z.string(),
      skills: z.array(z.string()),
      available_hours_per_month: z.number(),
    }),
  ),
  projects: z.array(
    z.object({
      project_id: z.string(),
      required_skills: z.array(z.string()),
      _raw_timeline: z.string().optional(),
      deadline: z.string().optional(),
    }),
  ),
  goals: z.array(
    z.object({
      goal_id: z.string(),
      required_skills: z.array(z.string()),
      _raw_description: z.string().optional(),
    }),
  ),
});

async function firstExisting(candidates: string[]): Promise<string> {
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next supported local/runtime layout.
    }
  }
  throw new Error(`QA input file not found. Checked: ${candidates.join(', ')}`);
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

function roadmapCandidates(): string[] {
  return [
    process.env.TRAINING_ROADMAP_OUTPUT_FILE,
    resolve(process.cwd(), 'roadmap_output_agent.json'),
    resolve(process.cwd(), '../../roadmap_output_agent.json'),
    fileURLToPath(new URL('../../../../../../roadmap_output_agent.json', import.meta.url)),
  ].filter((value): value is string => Boolean(value));
}

function normalizedDataCandidates(): string[] {
  const configured = process.env.TRAINING_ROADMAP_DATA_DIR;
  return [
    configured ? resolve(configured, 'normalized_data.json') : null,
    resolve(process.cwd(), 'data/processed/normalized_data.json'),
    resolve(process.cwd(), '../../data/processed/normalized_data.json'),
    fileURLToPath(
      new URL('../../../../../../data/processed/normalized_data.json', import.meta.url),
    ),
  ].filter((value): value is string => value !== null);
}

function trainerType(format: RoadmapOutputAgent['initiatives'][number]['format']) {
  return format === 'ON_JOB_TRAINING' || format === 'SEMINAR_SHARING'
    ? ('internal' as const)
    : format === 'GROUP_STUDY' || format === 'ONLINE_COURSE'
      ? ('self-study' as const)
      : ('external' as const);
}

export async function loadQaInputFromRoadmapOutput(): Promise<{
  source: RoadmapOutputAgent;
  qaInput: QaInput;
}> {
  const [roadmapPath, normalizedPath] = await Promise.all([
    firstExisting(roadmapCandidates()),
    firstExisting(normalizedDataCandidates()),
  ]);
  const [sourceRaw, normalizedRaw] = await Promise.all([
    readJson(roadmapPath),
    readJson(normalizedPath),
  ]);
  const source = roadmapOutputAgentSchema.parse(sourceRaw);
  const normalized = normalizedDataSchema.parse(normalizedRaw);
  const quarters = [...new Set(source.initiatives.map((initiative) => initiative.quarter))];

  const qaInput: QaInput = {
    roadmap: {
      items: source.initiatives.map((initiative) => ({
        initiativeId: initiative.id,
        skill: initiative.topic,
        traineeIds: initiative.targetTrainees,
        trainerType: trainerType(initiative.format),
        quarter: initiative.quarter,
        evidence: initiative.evidence.filter(
          (id) => id.startsWith('PRJ-') || id.startsWith('GOAL-'),
        ),
      })),
    },
    priorityResult: {
      initiatives: source.initiatives.map((initiative) => ({
        id: initiative.id,
        skill: initiative.topic,
        target_employees: initiative.targetTrainees,
        internal_trainer_available: initiative.trainerName !== null,
        supporting_projects: initiative.evidence.filter((id) => id.startsWith('PRJ-')),
        supporting_bod_goals: initiative.evidence.filter((id) => id.startsWith('GOAL-')),
        evidence_summary: initiative.formatExplanation,
        quarter: initiative.quarter,
      })),
    },
    normalizedData: {
      employees: normalized.employees.map((employee) => ({
        id: employee.employee_id,
        targetSkills: employee.self_reported_gaps,
      })),
      trainers: normalized.trainers.map((trainer) => ({
        id: trainer.trainer_id,
        skills: trainer.skills,
        availableHours: trainer.available_hours_per_month,
      })),
      projects: normalized.projects.map((project) => ({
        id: project.project_id,
        requiredSkills: project.required_skills,
        quarter: project._raw_timeline ?? project.deadline,
      })),
      bodGoals: normalized.goals.map((goal) => ({
        id: goal.goal_id,
        requiredSkills: goal.required_skills,
        description: goal._raw_description,
      })),
      planningHorizon: quarters.join(', '),
    },
  };

  return { source, qaInput };
}
