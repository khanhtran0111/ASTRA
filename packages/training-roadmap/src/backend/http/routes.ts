import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from '@mastra/core/agent';
import type { Context } from 'hono';
import { Hono } from 'hono';
import type { ApprovalDecision, ApprovalResponse, Priority, RoadmapResult } from '../../types.ts';
import { lndCoordinatorSpec } from '../agent-specs/lnd-orchestrator.spec.ts';
import {
  lndAssignLearningFormats,
  lndCompileQuarterlyRoadmap,
  lndFindAndAssignTrainer,
  lndGetPendingSkills,
} from '../agent-tools/roadmap-tools.ts';
import { loadRealData } from '../domain/data-loader.ts';
import { generateDraftRoadmap } from '../domain/generate-roadmap.ts';
import { matchTrainers } from '../domain/match-trainers.ts';
import type { DraftRoadmapOutput, MatchedTrainingClass } from '../domain/types.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SCRATCH_DIR = path.resolve(__dirname, '../../../../../scratch');

export const trainingRoadmapRoutes = new Hono();

function isApprovalDecision(value: unknown): value is ApprovalDecision {
  return value === 'approved' || value === 'revision_requested' || value === 'rejected';
}

async function readJsonBody(c: Context) {
  try {
    return (await c.req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function createRunId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `run-${Date.now()}`;
}

/** Map a priority score to a P1/P2/P3 tier for backward compat. */
function scoreToPriority(score: number): Priority {
  if (score >= 85) return 'P1';
  if (score >= 65) return 'P2';
  return 'P3';
}

/**
 * Convert the new DraftRoadmapOutput into the legacy RoadmapResult shape
 * so existing approval flow and tests continue to work.
 */
function toLegacyResult(draft: DraftRoadmapOutput, classes: MatchedTrainingClass[]): RoadmapResult {
  return {
    runId: createRunId(),
    reviewStatus: 'pending',
    executionLog: [
      'Loaded internal trainer pool.',
      'Loaded scored training needs.',
      `Matched ${classes.length} training needs to trainers.`,
      `${classes.filter((c) => !c.isExternalRequired).length} assigned internally.`,
      `${classes.filter((c) => c.isExternalRequired).length} flagged for external resource.`,
      'Generated draft roadmap.',
      'Paused at Human Review Gate.',
    ],
    initiatives: classes.map((cls) => ({
      id: cls.classId,
      topic: cls.skillName,
      priority: scoreToPriority(cls.priorityScore),
      score: cls.priorityScore,
      quarter: cls.targetQuarter.replace('_', ' '),
      targetTrainees: cls.trainees,
      trainerName: cls.assignedTrainer,
      format:
        cls.learningFormat || (cls.isExternalRequired ? 'EXTERNAL_TRAINER' : 'INTERNAL_TRAINING'),
      formatExplanation: cls.formatExplanation,
      evaluationCriteria: cls.evaluationCriteria,
      durationWeeks: cls.durationWeeks,
      estimatedHours: cls.estimatedHours,
      evidence: [...cls.evidence.bodGoals, ...cls.evidence.projectIds, ...cls.evidence.surveyIds],
      ...(cls.fallbackReason ? { fallbackReason: cls.fallbackReason } : {}),
    })),
    qaFindings: classes
      .filter((c) => c.isExternalRequired)
      .map((c, i) => ({
        id: `QA-${String(i + 1).padStart(3, '0')}`,
        risk: 'MEDIUM' as const,
        message: `${c.skillName}: ${c.fallbackReason === 'SKILL_NOT_FOUND_INTERNAL' ? 'No internal trainer found — external resource required.' : 'Internal trainer capacity exceeded — external resource required.'}`,
        relatedInitiativeId: c.classId,
      })),
  };
}

trainingRoadmapRoutes.get('/health', (c) => {
  return c.json({
    ok: true,
    module: 'training-roadmap',
  });
});

trainingRoadmapRoutes.post('/run', async (c) => {
  const body = await readJsonBody(c);
  const userPrompt = typeof body.userPrompt === 'string' ? body.userPrompt : '';

  // Initialize the L&D Coordinator Agent
  // The tools will auto-load the real data if arguments are omitted.
  try {
    const agent = new Agent({
      id: 'lnd-coordinator',
      name: 'L&D Coordinator',
      instructions: lndCoordinatorSpec.instructions,
      model: {
        providerId: 'openai',
        modelId: 'gpt-4o',
      },
      tools: {
        lnd_getPendingSkills: lndGetPendingSkills,
        lnd_findAndAssignTrainer: lndFindAndAssignTrainer,
        lnd_assignLearningFormats: lndAssignLearningFormats,
        lnd_compileQuarterlyRoadmap: lndCompileQuarterlyRoadmap,
      } as never,
    });

    const prompt = `Please retrieve the pending skills. If the user specifies a target team or role, pass that as 'targetTeam' to lnd_getPendingSkills. This will filter P3 skills at the data level to only include those requested by the target team.
  However, P1 and P2 skills (priorityScore >= 65) will NOT be filtered by the tool.
  
  CRITICAL SEMANTIC FILTERING: You MUST semantically evaluate EVERY returned skill (P1, P2, AND P3) against the user's specific goal (e.g. "React performance optimization và testing automation"). If a skill is NOT DIRECTLY related to the user's stated goal or constraints, you MUST drop it. DO NOT make loose associations (e.g., do not keep Python, GCP, Data Engineering, or Node.js just because the user mentioned 'automation' or 'frontend'). Only keep skills that are strictly and explicitly relevant.
  
  CRITICAL TIMELINE FILTERING: The returned skills now include a 'targetQuarter' field. If the user specifies a timeline constraint (e.g., 'Q3', '2026'), you MUST drop ALL skills that do not match the requested timeframe.
  
  CRITICAL KEY NAMING: The keys in your "skills" JSON output MUST be EXACTLY the original "skillName" string from lnd_getPendingSkills. Do not shorten or alter them (e.g., "CI/CD Delivery Practices", NOT "CI/CD").
  
  Once you have your final list of relevant skills (after semantic and timeline filtering), you MUST call 'lnd_findAndAssignTrainer' and pass 'relevantSkills' (an array of skill names you kept) and 'targetTeam', along with the 'estimatedHoursMap' (estimating hours strictly based on intrinsic difficulty, not trainee count).
  Then, for the skills that were successfully matched, assign an appropriate learning format prioritizing internal methods over external.
  
  USER CONSTRAINTS AND PREFERENCES:
  "${userPrompt || 'None specified'}"
  
  You MUST respect the user constraints (e.g. prioritize OJT, specific evaluation criteria, or max hours per week). Based on max hours per week, you should calculate 'durationWeeks'.
  You MUST summarize your estimations and format decisions inside a single markdown JSON codeblock at the end of your response, with the structure:
  {
    "skills": {
      "SkillName": {
        "estimatedHours": 40,
        "learningFormat": "ONLINE_COURSE",
        "formatExplanation": "Reasoning for format based on user constraints",
        "evaluationCriteria": "Criteria to evaluate success",
        "durationWeeks": 10
      }
    }
  }
  Output the FULL valid JSON for ALL skills. Do NOT use comments, ellipses (// ...), or truncate the JSON. Do NOT call lnd_assignLearningFormats tool, just output the JSON block.`;

    const response = await agent.generate(prompt);

    console.log('\n=======================================');
    console.log('🤖 AGENT REASONING:');
    console.log('=======================================');
    console.log(response.text);
    console.log('=======================================\n');

    // Extract JSON block from response.text
    let extractedMap: any = {};
    const jsonMatch = response.text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    let rawJson = jsonMatch && jsonMatch[1] ? jsonMatch[1] : response.text || '';

    // Clean up potential markdown formatting if regex didn't catch it
    if (!jsonMatch && rawJson.includes('```')) {
      rawJson = rawJson.replace(/```(?:json)?/g, '').replace(/```/g, '');
    }

    try {
      const parsed = JSON.parse(rawJson.trim());
      if (parsed.skills) {
        extractedMap = parsed.skills;
      }
    } catch (e) {
      console.error('Failed to parse agent JSON block', e);
    }

    // Apply to matched_classes.json
    const scratchPath = path.resolve(SCRATCH_DIR, 'matched_classes.json');
    if (fs.existsSync(scratchPath)) {
      const raw = fs.readFileSync(scratchPath, 'utf-8');
      let matchedClasses = JSON.parse(raw);

      // Filter out skills that the LLM dropped (semantic filtering)
      if (userPrompt && Object.keys(extractedMap).length > 0) {
        matchedClasses = matchedClasses.filter((cls: any) => {
          // Fallback fuzzy matching in case LLM shortens the name
          return (
            extractedMap[cls.skillName] !== undefined ||
            Object.keys(extractedMap).some(
              (k) => cls.skillName.includes(k) || k.includes(cls.skillName),
            )
          );
        });
      }

      for (const cls of matchedClasses) {
        // Find exact or fuzzy match
        const key = Object.keys(extractedMap).find(
          (k) => k === cls.skillName || cls.skillName.includes(k) || k.includes(cls.skillName),
        );
        const updates = key ? extractedMap[key] : undefined;
        if (updates) {
          if (updates.estimatedHours) cls.estimatedHours = updates.estimatedHours;
          if (updates.learningFormat) cls.learningFormat = updates.learningFormat;
          if (updates.formatExplanation) cls.formatExplanation = updates.formatExplanation;
          if (updates.evaluationCriteria) cls.evaluationCriteria = updates.evaluationCriteria;
          if (updates.durationWeeks) cls.durationWeeks = updates.durationWeeks;
        }
        if (!cls.learningFormat) {
          cls.learningFormat = cls.isExternalRequired ? 'EXTERNAL_TRAINER' : 'INTERNAL_TRAINING';
        }
      }
      fs.writeFileSync(scratchPath, JSON.stringify(matchedClasses, null, 2));
    }

    // Directly call the compilation tool to guarantee the JSON is captured correctly
    let draftRoadmap = null;
    let matchedClasses: any[] = [];
    try {
      // Read matchedClasses for legacy support
      const raw = fs.readFileSync(path.resolve(SCRATCH_DIR, 'matched_classes.json'), 'utf-8');
      matchedClasses = JSON.parse(raw);

      // Generate draft roadmap directly using the domain function
      draftRoadmap = generateDraftRoadmap(matchedClasses, 'RM-2026-V1');
    } catch (err) {
      console.error('Error compiling roadmap:', err);
    }

    let legacy = null;
    if (draftRoadmap) {
      legacy = toLegacyResult(draftRoadmap, matchedClasses);
    }

    const responseJson = {
      agentReasoning: response.text,
      ...(legacy ? legacy : {}),
      draftRoadmap: draftRoadmap,
    };

    // Write full result to file for debugging
    fs.writeFileSync(
      path.resolve(SCRATCH_DIR, 'roadmap_output_agent.json'),
      JSON.stringify(responseJson, null, 2),
    );

    return c.json(responseJson);
  } catch (err) {
    console.error('Agent execution error:', err);
    return c.json({ error: String(err) }, 500);
  }
});

trainingRoadmapRoutes.post('/approve', async (c) => {
  const body = await readJsonBody(c);

  if (typeof body.runId !== 'string' || body.runId.trim().length === 0) {
    return c.json({ error: 'runId is required' }, 400);
  }

  if (!isApprovalDecision(body.decision)) {
    return c.json({ error: 'Invalid decision' }, 400);
  }

  const response: ApprovalResponse = {
    runId: body.runId,
    reviewStatus: body.decision,
    approvalToken: body.decision === 'approved' ? `APPROVAL-${Date.now()}` : null,
  };

  return c.json(response);
});
