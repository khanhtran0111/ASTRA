/**
 * Agent Tools for the L&D Coordinator Agent (Agent 1).
 *
 * These tools wrap the deterministic domain logic (match-trainers,
 * generate-roadmap) into SETA agent tools via `defineAgentTool`, making
 * them callable by the LLM orchestrator via function calling.
 *
 * The tools themselves contain NO LLM logic — they are pure wrappers
 * around rule-based domain functions.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SCRATCH_DIR = resolve(__dirname, '../../../../../scratch');
// scratch/ is gitignored (debug working dir) — a fresh checkout (CI, new
// clone) won't have it on disk, and writeFileSync does not create parent
// directories on its own.
mkdirSync(SCRATCH_DIR, { recursive: true });

import { loadRealData, loadTrainersFromCSV } from '../domain/data-loader.ts';
import { generateDraftRoadmap } from '../domain/generate-roadmap.ts';
import { matchTrainers } from '../domain/match-trainers.ts';
import type { InternalTrainer, ScoredTrainingNeed } from '../domain/types.ts';

// ---------------------------------------------------------------------------
// Zod Schemas for tool input / output validation
// ---------------------------------------------------------------------------

const EvidenceSchema = z.object({
  bodGoals: z.array(z.string()),
  projectIds: z.array(z.string()),
  surveyIds: z.array(z.string()),
});

const ScoredTrainingNeedSchema = z.object({
  needId: z.string(),
  skillName: z.string(),
  priorityScore: z.number(),
  traineeIds: z.array(z.string()),
  estimatedHours: z.number().positive(),
  targetQuarter: z.string(),
  evidence: EvidenceSchema,
});

const InternalTrainerSchema = z.object({
  trainerId: z.string(),
  expertise: z.array(z.string()),
  availabilityHoursPerMonth: z.number().nonnegative(),
});

const FallbackReasonSchema = z.enum(['SKILL_NOT_FOUND_INTERNAL', 'CAPACITY_EXCEEDED']);

const MatchedTrainingClassSchema = z.object({
  classId: z.string(),
  skillName: z.string(),
  trainees: z.array(z.string()),
  assignedTrainer: z.string().nullable(),
  isExternalRequired: z.boolean(),
  fallbackReason: FallbackReasonSchema.optional(),
  targetQuarter: z.string(),
  evidence: EvidenceSchema,
  priorityScore: z.number(),
  estimatedHours: z.number(),
});

const RoadmapClassEntrySchema = z.object({
  classId: z.string(),
  topic: z.string(),
  priorityScore: z.number(),
  alignmentEvidence: z.object({
    bodGoals: z.array(z.string()),
    projects: z.array(z.string()),
  }),
  traineeCount: z.number(),
  trainees: z.array(z.string()),
  estimatedHours: z.number(),
  resource: z.object({
    trainerId: z.string().nullable(),
    isExternalRequired: z.boolean(),
    fallbackReason: FallbackReasonSchema.nullable(),
  }),
});

const DraftRoadmapOutputSchema = z.object({
  roadmapId: z.string(),
  status: z.literal('DRAFT'),
  generatedAt: z.string(),
  quarters: z.record(z.string(), z.array(RoadmapClassEntrySchema)),
});

// ---------------------------------------------------------------------------
// Tool 1: Get Pending Skills
// ---------------------------------------------------------------------------

export const lndGetPendingSkills = createTool({
  id: 'lnd_getPendingSkills',
  description:
    'Retrieve the list of pending training needs/skills to estimate required hours. You can optionally filter by targetTeam if the user requested a specific team.',
  inputSchema: z.object({
    targetTeam: z.string().optional(),
  }),
  outputSchema: z.any(),
  execute: async (args: any) => {
    const { targetTeam } = args;
    console.log(`Tool lndGetPendingSkills called by LLM with targetTeam: ${targetTeam || 'None'}`);
    const needs = loadRealData(targetTeam).trainingNeeds;
    return needs.map((n) => ({
      skillName: n.skillName,
      traineeCount: n.traineeIds.length,
      priorityScore: n.priorityScore,
      targetQuarter: n.targetQuarter,
    }));
  },
});

// ---------------------------------------------------------------------------
// Tool 2: Find and Assign Trainers
// ---------------------------------------------------------------------------

export const lndFindAndAssignTrainer = createTool({
  id: 'lnd_findAndAssignTrainer',
  description: [
    'Match a list of prioritized training needs to internal trainers.',
    '',
    'This tool performs DETERMINISTIC capacity checking:',
    '1. Finds trainers whose expertise matches each skill (case-insensitive)',
    '2. Checks if the trainer has enough available hours per month',
    '3. Assigns the trainer and deducts their capacity',
    '4. Flags SKILL_NOT_FOUND_INTERNAL or CAPACITY_EXCEEDED if no assignment possible',
    '',
    'If no trainers are provided, uses the default internal trainer pool.',
  ].join('\n'),
  inputSchema: z.object({
    targetTeam: z.string().optional(),
    relevantSkills: z
      .array(z.string())
      .optional()
      .describe(
        'List of skill names (P1, P2, P3) that are kept after your semantic filtering. Only these will be matched.',
      ),
    estimatedHoursMap: z
      .record(z.string(), z.number())
      .describe(
        'A JSON object mapping skillName to estimated hours (e.g., {"Kubernetes": 40, "Python": 20})',
      ),
  }),
  outputSchema: z.any(),
  execute: async (args: any) => {
    try {
      console.log('ARGS lndFindAndAssignTrainer:', JSON.stringify(args, null, 2));
      const { estimatedHoursMap, targetTeam, relevantSkills } = args as any;
      console.log(
        `Tool lndFindAndAssignTrainer called with targetTeam=${targetTeam}, relevantSkills=${relevantSkills?.length}`,
      );
      const trainerPool: InternalTrainer[] = loadTrainersFromCSV();

      let resolvedNeeds = loadRealData(targetTeam).trainingNeeds.sort(
        (a, b) => b.priorityScore - a.priorityScore,
      );

      // Filter out irrelevant P1/P2 skills before matching to save trainer capacity
      if (relevantSkills && Array.isArray(relevantSkills) && relevantSkills.length > 0) {
        resolvedNeeds = resolvedNeeds.filter((need) => relevantSkills.includes(need.skillName));
      }

      // Override estimated hours with LLM's estimations
      if (estimatedHoursMap) {
        for (const need of resolvedNeeds) {
          if (estimatedHoursMap[need.skillName]) {
            need.estimatedHours = estimatedHoursMap[need.skillName];
          }
        }
      }

      const typedNeeds = resolvedNeeds as ScoredTrainingNeed[];
      const matched = matchTrainers(typedNeeds, trainerPool);

      // Save matched classes to scratch for the next tool to use
      writeFileSync(resolve(SCRATCH_DIR, 'matched_classes.json'), JSON.stringify(matched, null, 2));

      const assigned = matched.filter((m) => !m.isExternalRequired).length;

      return {
        success: true,
        totalNeeds: typedNeeds.length,
        internallyAssigned: assigned,
        externalRequired: matched.length - assigned,
        matchedClasses: matched, // Returning this so LLM can read unassigned classes
      };
    } catch (error: any) {
      console.error('Error in lndFindAndAssignTrainer:', error);
      throw new Error(`Failed to match trainers: ${error.message}`);
    }
  },
});

// ---------------------------------------------------------------------------
// Tool 3: Assign Learning Formats
// ---------------------------------------------------------------------------

export const lndAssignLearningFormats = createTool({
  id: 'lnd_assignLearningFormats',
  description: [
    'Assign a learning format for each skill, especially those lacking an internal trainer.',
    'Formats: INTERNAL_TRAINING, ON_JOB_TRAINING, GROUP_STUDY, EXTERNAL_TRAINER, ONLINE_COURSE, SEMINAR_SHARING',
  ].join('\n'),
  inputSchema: z.object({
    formatMap: z
      .record(z.string(), z.string())
      .describe('A JSON object mapping skillName to LearningFormat enum string.'),
  }),
  outputSchema: z.any(),
  execute: async (args: any) => {
    try {
      console.log('ARGS lndAssignLearningFormats:', JSON.stringify(args, null, 2));
      const { formatMap } = args as any;
      console.log('Tool lndAssignLearningFormats called by LLM with map:', formatMap);
      const map = formatMap || {};

      const filePath = resolve(SCRATCH_DIR, 'matched_classes.json');
      const raw = readFileSync(filePath, 'utf-8');
      const matchedClasses = JSON.parse(raw);

      for (const cls of matchedClasses) {
        if (map[cls.skillName]) {
          cls.learningFormat = map[cls.skillName];
        } else {
          // Default fallback
          cls.learningFormat = cls.isExternalRequired ? 'EXTERNAL_TRAINER' : 'INTERNAL_TRAINING';
        }
      }

      writeFileSync(filePath, JSON.stringify(matchedClasses, null, 2));

      return {
        success: true,
        message: 'Learning formats assigned successfully',
      };
    } catch (error: any) {
      console.error('Error in lndAssignLearningFormats:', error);
      throw new Error(`Failed to assign learning formats: ${error.message}`);
    }
  },
});

// ---------------------------------------------------------------------------
// Tool 4: Compile Quarterly Roadmap
// ---------------------------------------------------------------------------

export const lndCompileQuarterlyRoadmap = createTool({
  id: 'lnd_compileQuarterlyRoadmap',
  description: [
    'Compile matched training classes into a quarterly draft roadmap.',
    '',
    'Groups classes by targetQuarter and produces the DraftRoadmapOutput JSON.',
    'This is the FINAL step — the output goes directly to the QA Agent for review.',
    '',
    'Pass the matchedClasses output from lnd_findAndAssignTrainer.',
  ].join('\n'),
  inputSchema: z.object({
    roadmapId: z
      .string()
      .optional()
      .describe('Roadmap version identifier. Defaults to "RM-2026-V1".'),
  }),
  outputSchema: z.any(),
  execute: async (args: any) => {
    const { roadmapId } = args;
    // Read matched classes from previous tool's output
    const raw = readFileSync(resolve(SCRATCH_DIR, 'matched_classes.json'), 'utf-8');
    const matchedClasses = JSON.parse(raw);

    return generateDraftRoadmap(matchedClasses, roadmapId);
  },
});
