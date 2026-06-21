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

function getCSVHeader(rows: string[][], source: string): string[] {
  const header = rows[0];
  if (!header) {
    throw new Error(`${source}: CSV header is missing`);
  }
  return header;
}

function getColumnIndex(header: string[], column: string, source: string): number {
  const index = header.indexOf(column);
  if (index === -1) {
    throw new Error(`${source}: required column "${column}" is missing`);
  }
  return index;
}

function getRequiredCell(
  row: string[],
  columnIndex: number,
  column: string,
  source: string,
  rowNumber: number,
): string {
  const value = row[columnIndex];
  if (!value) {
    throw new Error(`${source}: row ${rowNumber} has no value for "${column}"`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// DS04: Internal Trainer List
// ---------------------------------------------------------------------------

export function loadTrainersFromCSV(): InternalTrainer[] {
  const source = 'DS04_Internal_Trainer_List.csv';
  const raw = readFileSync(resolve(DATA_DIR, source), 'utf-8');
  const rows = parseCSVLines(raw);
  const header = getCSVHeader(rows, source);
  const idIdx = getColumnIndex(header, 'Trainer_ID', source);
  const expertiseIdx = getColumnIndex(header, 'Expertise', source);
  const hoursIdx = getColumnIndex(header, 'Availability_Hours_Per_Month', source);

  return rows.slice(1).map((row, index) => {
    const rowNumber = index + 2;
    const trainerId = getRequiredCell(row, idIdx, 'Trainer_ID', source, rowNumber);
    const expertiseRaw = getRequiredCell(row, expertiseIdx, 'Expertise', source, rowNumber);
    const hoursRaw = getRequiredCell(
      row,
      hoursIdx,
      'Availability_Hours_Per_Month',
      source,
      rowNumber,
    );
    const availabilityHoursPerMonth = Number.parseInt(hoursRaw, 10);

    if (Number.isNaN(availabilityHoursPerMonth)) {
      throw new Error(`${source}: row ${rowNumber} has invalid availability hours`);
    }

    return {
      trainerId,
      expertise: expertiseRaw
        .split(/[;,]/)
        .map((expertise) => expertise.trim())
        .filter(Boolean),
      availabilityHoursPerMonth,
    };
  });
}

// ---------------------------------------------------------------------------
// DS01: Employee Roles
// ---------------------------------------------------------------------------

export function loadEmployeeRoles(): Map<string, string> {
  const source = 'DS01_Employee_Skill_Profile.csv';
  const raw = readFileSync(resolve(DATA_DIR, source), 'utf-8');
  const rows = parseCSVLines(raw);
  const header = getCSVHeader(rows, source);
  const idIdx = getColumnIndex(header, 'Employee_ID', source);
  const roleIdx = getColumnIndex(header, 'Position', source);

  const map = new Map<string, string>();
  for (const row of rows.slice(1)) {
    const employeeId = row[idIdx];
    const role = row[roleIdx];
    if (employeeId && role) {
      map.set(employeeId, role);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// DS05: BOD Goals → Quarter mapping
// ---------------------------------------------------------------------------

function loadGoalQuarterMap(): Map<string, string> {
  const source = 'DS05_BOD_Training_Goals.csv';
  const raw = readFileSync(resolve(DATA_DIR, source), 'utf-8');
  const rows = parseCSVLines(raw);
  const header = getCSVHeader(rows, source);
  const goalIdIdx = getColumnIndex(header, 'Goal_ID', source);
  const quarterIdx = getColumnIndex(header, 'Target_Quarter', source);

  const map = new Map<string, string>();
  for (const [index, row] of rows.slice(1).entries()) {
    const rowNumber = index + 2;
    const goalId = getRequiredCell(row, goalIdIdx, 'Goal_ID', source, rowNumber);
    const quarter = getRequiredCell(row, quarterIdx, 'Target_Quarter', source, rowNumber);
    map.set(goalId, quarter);
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
          return role?.toLowerCase().includes(teamKey) ?? false;
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
