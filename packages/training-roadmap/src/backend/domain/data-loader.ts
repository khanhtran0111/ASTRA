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

type EmployeeScopeProfile = {
  position: string;
  proficiency: string;
};

function loadEmployeeScopeProfiles(): Map<string, EmployeeScopeProfile> {
  const source = 'DS01_Employee_Skill_Profile.csv';
  const raw = readFileSync(resolve(DATA_DIR, source), 'utf-8');
  const rows = parseCSVLines(raw);
  const header = getCSVHeader(rows, source);
  const idIdx = getColumnIndex(header, 'Employee_ID', source);
  const roleIdx = getColumnIndex(header, 'Position', source);
  const proficiencyIdx = getColumnIndex(header, 'Proficiency_Level', source);
  const profiles = new Map<string, EmployeeScopeProfile>();

  for (const row of rows.slice(1)) {
    const employeeId = row[idIdx];
    const position = row[roleIdx];
    const proficiency = row[proficiencyIdx];
    if (employeeId && position && proficiency) {
      profiles.set(employeeId, { position, proficiency });
    }
  }

  return profiles;
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

function normalizeTeam(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bteam\b/g, '')
    .replace(/[\s_-]+/g, '')
    .trim();
}

function normalizeProficiency(value: string): string {
  const normalized = value.toLowerCase().replace(/[\s_-]+/g, '');
  if (normalized === 'mid' || normalized === 'midlevel') return 'intermediate';
  if (normalized === 'junior' || normalized === 'juniorlevel') return 'beginner';
  if (normalized === 'senior' || normalized === 'seniorlevel') return 'advanced';
  return normalized;
}

function normalizeQuarter(value: string): string | null {
  const match = /Q([1-4])\D*(20\d{2})/i.exec(value);
  return match ? `Q${match[1]}_${match[2]}` : null;
}

export function loadRealData(
  targetTeam?: string,
  targetProficiency?: string,
  targetQuarter?: string,
) {
  let trainingNeeds = loadTrainingNeedsFromJSON();
  const requestedQuarter = targetQuarter ? normalizeQuarter(targetQuarter) : null;

  if (targetTeam?.trim() || targetProficiency?.trim()) {
    const profiles = loadEmployeeScopeProfiles();
    const teamKey = targetTeam?.trim() ? normalizeTeam(targetTeam) : null;
    const proficiencyKey = targetProficiency?.trim()
      ? normalizeProficiency(targetProficiency)
      : null;
    const scopedEmployeeIds = [...profiles]
      .filter(([, profile]) => {
        const matchesTeam = teamKey ? normalizeTeam(profile.position).includes(teamKey) : true;
        const matchesProficiency = proficiencyKey
          ? normalizeProficiency(profile.proficiency) === proficiencyKey
          : true;
        return matchesTeam && matchesProficiency;
      })
      .map(([employeeId]) => employeeId);
    const scopedEmployeeIdSet = new Set(scopedEmployeeIds);

    trainingNeeds = trainingNeeds
      .map((need) => {
        const employeesWithRecordedGap = need.traineeIds.filter((id) =>
          scopedEmployeeIdSet.has(id),
        );
        const hasBusinessEvidence =
          need.evidence.bodGoals.length > 0 || need.evidence.projectIds.length > 0;
        const filteredTrainees =
          employeesWithRecordedGap.length > 0
            ? employeesWithRecordedGap
            : hasBusinessEvidence
              ? scopedEmployeeIds
              : [];
        return {
          ...need,
          traineeIds: filteredTrainees,
          estimatedHours: estimateHours(filteredTrainees.length),
          targetQuarter: requestedQuarter ?? need.targetQuarter,
        };
      })
      .filter((need) => need.traineeIds.length > 0);
  } else if (requestedQuarter) {
    trainingNeeds = trainingNeeds.map((need) => ({
      ...need,
      targetQuarter: requestedQuarter,
    }));
  }

  return {
    trainers: loadTrainersFromCSV(),
    trainingNeeds,
  };
}
