/**
 * Real Data Loader — reads from d:\ASTRA\data\ instead of hardcoded mocks.
 *
 * Sources:
 *   - DS04_Internal_Trainer_List.csv → InternalTrainer[]
 *   - DS05_BOD_Training_Goals.csv   → Goal ID → Target Quarter mapping
 *   - processed/priority_result.json → ScoredTrainingNeed[]
 *
 * The estimatedHours field is derived heuristically from trainee count:
 *   - ≤ 5 trainees  → 8h
 *   - ≤ 15 trainees → 16h
 *   - > 15 trainees → 24h
 *
 * The targetQuarter is resolved from the first supporting_bod_goal via DS05.
 * If no BOD goal is linked, falls back to the nearest future quarter.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { InternalTrainer, ScoredTrainingNeed } from './types.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
// Navigate from domain/ → src/backend/ → src/ → packages/training-roadmap/ → ASTRA/data/
const DATA_DIR = resolve(__dirname, '../../../../../data');

// ---------------------------------------------------------------------------
// CSV parser helpers (no external dependencies)
// ---------------------------------------------------------------------------

function parseCSVLines(raw: string): string[][] {
  const lines = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  return lines.map((line) => {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  });
}

// ---------------------------------------------------------------------------
// DS04: Internal Trainer List
// ---------------------------------------------------------------------------

export function loadTrainersFromCSV(): InternalTrainer[] {
  const raw = readFileSync(resolve(DATA_DIR, 'DS04_Internal_Trainer_List.csv'), 'utf-8');
  const rows = parseCSVLines(raw);
  const header = rows[0]!;
  const idIdx = header.indexOf('Trainer_ID');
  const expertiseIdx = header.indexOf('Expertise');
  const hoursIdx = header.indexOf('Availability_Hours_Per_Month');

  return rows.slice(1).map((row) => ({
    trainerId: row[idIdx]!,
    expertise: row[expertiseIdx]!.split(/[;,]/)
      .map((s) => s.trim())
      .filter(Boolean),
    availabilityHoursPerMonth: Number.parseInt(row[hoursIdx]!, 10),
  }));
}

// ---------------------------------------------------------------------------
// DS01: Employee Roles
// ---------------------------------------------------------------------------

export function loadEmployeeRoles(): Map<string, string> {
  const raw = readFileSync(resolve(DATA_DIR, 'DS01_Employee_Skill_Profile.csv'), 'utf-8');
  const rows = parseCSVLines(raw);
  const header = rows[0]!;
  const idIdx = header.indexOf('Employee_ID');
  const roleIdx = header.indexOf('Position');

  const map = new Map<string, string>();
  for (const row of rows.slice(1)) {
    if (row[idIdx] && row[roleIdx]) {
      map.set(row[idIdx]!, row[roleIdx]!);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// DS05: BOD Goals → Quarter mapping
// ---------------------------------------------------------------------------

function loadGoalQuarterMap(): Map<string, string> {
  const raw = readFileSync(resolve(DATA_DIR, 'DS05_BOD_Training_Goals.csv'), 'utf-8');
  const rows = parseCSVLines(raw);
  const header = rows[0]!;
  const goalIdIdx = header.indexOf('Goal_ID');
  const quarterIdx = header.indexOf('Target_Quarter');

  const map = new Map<string, string>();
  for (const row of rows.slice(1)) {
    map.set(row[goalIdIdx]!, row[quarterIdx]!);
  }
  return map;
}

// ---------------------------------------------------------------------------
// priority_result.json → ScoredTrainingNeed[]
// ---------------------------------------------------------------------------

interface PriorityInitiative {
  skill: string;
  priority_tier: string;
  total_score: number;
  target_employees: string[];
  target_employee_count: number;
  supporting_projects: string[];
  supporting_bod_goals: string[];
  internal_trainer_available: boolean;
  internal_trainers: string[];
  evidence_summary: string;
}

interface PriorityResult {
  initiatives: PriorityInitiative[];
}

/** Estimate course hours from trainee count. */
function estimateHours(traineeCount: number): number {
  if (traineeCount <= 5) return 8;
  if (traineeCount <= 15) return 16;
  return 24;
}

/** Default target quarter when no BOD goal is linked. */
const DEFAULT_QUARTER = 'Q3_2026';

export function loadTrainingNeedsFromJSON(): ScoredTrainingNeed[] {
  const raw = readFileSync(resolve(DATA_DIR, 'processed/priority_result.json'), 'utf-8');
  const data = JSON.parse(raw) as PriorityResult;
  const goalQuarters = loadGoalQuarterMap();

  let needCounter = 0;

  return data.initiatives.map((init) => {
    needCounter++;

    // Resolve target quarter from the first supporting BOD goal
    let targetQuarter = DEFAULT_QUARTER;
    for (const goalId of init.supporting_bod_goals) {
      const q = goalQuarters.get(goalId);
      if (q) {
        targetQuarter = q;
        break;
      }
    }

    // Extract survey IDs from evidence summary if present
    const surveyIds: string[] = [];
    if (init.evidence_summary.includes('survey')) {
      surveyIds.push('SUR_2025_Q4'); // Only survey wave in the dataset
    }

    return {
      needId: `NEED-${String(needCounter).padStart(3, '0')}`,
      skillName: init.skill,
      priorityScore: init.total_score,
      traineeIds: init.target_employees,
      estimatedHours: estimateHours(init.target_employee_count),
      targetQuarter,
      evidence: {
        bodGoals: init.supporting_bod_goals,
        projectIds: init.supporting_projects,
        surveyIds,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Convenience: load both at once
// ---------------------------------------------------------------------------

export function loadRealData(targetTeam?: string) {
  let trainingNeeds = loadTrainingNeedsFromJSON();

  if (targetTeam && targetTeam.trim() !== '') {
    const roleMap = loadEmployeeRoles();
    const teamKey = targetTeam.toLowerCase();

    trainingNeeds = trainingNeeds
      .map((need) => {
        // P1 and P2 (score >= 65) are NOT filtered by team mapping
        if (need.priorityScore >= 65) {
          return need;
        }

        // P3 (score < 65) are filtered by team
        const filteredTrainees = need.traineeIds.filter((id) => {
          const role = roleMap.get(id);
          return role && role.toLowerCase().includes(teamKey);
        });
        return {
          ...need,
          traineeIds: filteredTrainees,
          estimatedHours: estimateHours(filteredTrainees.length),
        };
      })
      .filter((need) => need.priorityScore >= 65 || need.traineeIds.length > 0);
  }

  return {
    trainers: loadTrainersFromCSV(),
    trainingNeeds,
  };
}
