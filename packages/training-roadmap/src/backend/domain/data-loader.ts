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
import type { EvidenceRef } from '../../types.ts';
import type { EmployeeProfile, ProjectProfile } from './trainee-allocator.ts';
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
  skillGaps: string[];
  rawSkillGap: string;
};

function loadEmployeeScopeProfiles(): Map<string, EmployeeScopeProfile> {
  const source = 'DS01_Employee_Skill_Profile.csv';
  const raw = readFileSync(resolve(DATA_DIR, source), 'utf-8');
  const rows = parseCSVLines(raw);
  const header = getCSVHeader(rows, source);
  const idIdx = getColumnIndex(header, 'Employee_ID', source);
  const roleIdx = getColumnIndex(header, 'Position', source);
  const proficiencyIdx = getColumnIndex(header, 'Proficiency_Level', source);
  const skillGapIdx = getColumnIndex(header, 'Skill_Gap', source);
  const profiles = new Map<string, EmployeeScopeProfile>();

  for (const row of rows.slice(1)) {
    const employeeId = row[idIdx];
    const position = row[roleIdx];
    const proficiency = row[proficiencyIdx];
    const rawSkillGap = row[skillGapIdx] ?? '';
    if (employeeId && position && proficiency) {
      profiles.set(employeeId, {
        position,
        proficiency,
        skillGaps: rawSkillGap
          .split(/[;,]/)
          .map((skill) => skill.trim())
          .filter(Boolean),
        rawSkillGap,
      });
    }
  }

  return profiles;
}

export function loadEmployeeProfiles(): EmployeeProfile[] {
  const profilesMap = loadEmployeeScopeProfiles();
  const source = 'DS01_Employee_Skill_Profile.csv';
  const raw = readFileSync(resolve(DATA_DIR, source), 'utf-8');
  const rows = parseCSVLines(raw);
  const header = getCSVHeader(rows, source);
  const idIdx = getColumnIndex(header, 'Employee_ID', source);

  // DS01 exports current skills under either column name depending on fixture/source vintage.
  const skillsIndex =
    header.indexOf('Skills') !== -1 ? header.indexOf('Skills') : header.indexOf('Current_Skills');

  const list: EmployeeProfile[] = [];
  for (const [employeeId, profile] of profilesMap.entries()) {
    const row = rows.slice(1).find((r) => r[idIdx] === employeeId);
    const rawSkills = row && skillsIndex !== -1 ? row[skillsIndex] : '';
    const currentSkills = rawSkills
      ? rawSkills
          .split(/[;,]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    list.push({
      employeeId,
      position: profile.position,
      proficiencyLevel: profile.proficiency,
      currentSkills,
      skillGaps: profile.skillGaps,
      rawSkillGap: profile.rawSkillGap,
    });
  }
  return list;
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

function normalizeSkill(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function hasDirectSkillGap(profile: EmployeeScopeProfile, skillName: string): boolean {
  const requested = normalizeSkill(skillName);
  return profile.skillGaps.some((gap) => {
    const candidate = normalizeSkill(gap);
    return (
      candidate === requested || candidate.includes(requested) || requested.includes(candidate)
    );
  });
}

function loadProjectEvidence(): Map<string, { value: string }> {
  const source = 'DS02_Project_Roadmap.csv';
  const rows = parseCSVLines(readFileSync(resolve(DATA_DIR, source), 'utf-8'));
  const header = getCSVHeader(rows, source);
  const idIdx = getColumnIndex(header, 'Project_ID', source);
  const skillsIdx = getColumnIndex(header, 'Required_Skills', source);
  const projects = new Map<string, { value: string }>();
  for (const row of rows.slice(1)) {
    const projectId = row[idIdx];
    if (projectId) projects.set(projectId, { value: row[skillsIdx] ?? '' });
  }
  return projects;
}

export function loadProjectProfiles(): ProjectProfile[] {
  const source = 'DS02_Project_Roadmap.csv';
  const rows = parseCSVLines(readFileSync(resolve(DATA_DIR, source), 'utf-8'));
  const header = getCSVHeader(rows, source);
  const idIdx = getColumnIndex(header, 'Project_ID', source);
  const skillsIdx = getColumnIndex(header, 'Required_Skills', source);

  return rows
    .slice(1)
    .map((row) => {
      const projectId = row[idIdx]?.trim();
      if (!projectId) return null;

      const skillsRaw = row[skillsIdx] ?? '';
      const requiredSkills = skillsRaw
        ? skillsRaw
            .split(/[;,]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      return { projectId, requiredSkills };
    })
    .filter((project): project is ProjectProfile => project !== null);
}

function loadGoalEvidence(): Map<string, { value: string }> {
  const source = 'DS05_BOD_Training_Goals.csv';
  const rows = parseCSVLines(readFileSync(resolve(DATA_DIR, source), 'utf-8'));
  const header = getCSVHeader(rows, source);
  const idIdx = getColumnIndex(header, 'Goal_ID', source);
  const descriptionIdx = getColumnIndex(header, 'Goal_Description', source);
  const goals = new Map<string, { value: string }>();
  for (const row of rows.slice(1)) {
    const goalId = row[idIdx];
    if (goalId) goals.set(goalId, { value: row[descriptionIdx] ?? '' });
  }
  return goals;
}

type SurveyEvidenceRow = { surveyId: string; employeeId: string; topic: string };

function loadSurveyEvidence(): SurveyEvidenceRow[] {
  const source = 'DS03_Training_Need_Survey.csv';
  const rows = parseCSVLines(readFileSync(resolve(DATA_DIR, source), 'utf-8'));
  const header = getCSVHeader(rows, source);
  const surveyIdx = getColumnIndex(header, 'Survey_ID', source);
  const employeeIdx = getColumnIndex(header, 'Employee_ID', source);
  const topicIdx = getColumnIndex(header, 'Training_Topic', source);
  return rows.slice(1).flatMap((row) => {
    const surveyId = row[surveyIdx];
    const employeeId = row[employeeIdx];
    const topic = row[topicIdx];
    return surveyId && employeeId && topic ? [{ surveyId, employeeId, topic }] : [];
  });
}

function buildEvidenceRefs(
  need: ScoredTrainingNeed,
  profiles: Map<string, EmployeeScopeProfile>,
  projects: Map<string, { value: string }>,
  goals: Map<string, { value: string }>,
  surveys: SurveyEvidenceRow[],
): EvidenceRef[] {
  const refs: EvidenceRef[] = [];

  for (const employeeId of need.traineeIds) {
    const profile = profiles.get(employeeId);
    if (!profile || !hasDirectSkillGap(profile, need.skillName)) continue;
    refs.push({
      source: 'DS01',
      recordId: employeeId,
      field: 'Skill_Gap',
      value: profile.rawSkillGap,
      reason: `${profile.position} (${profile.proficiency}) has a direct recorded gap matching ${need.skillName}.`,
    });
  }
  for (const projectId of need.evidence.projectIds) {
    const project = projects.get(projectId);
    if (!project) continue;
    refs.push({
      source: 'DS02',
      recordId: projectId,
      field: 'Required_Skills',
      value: project.value,
      reason: `Project roadmap evidence supports the ${need.skillName} initiative.`,
    });
  }
  for (const surveyId of need.evidence.surveyIds) {
    for (const survey of surveys.filter(
      (candidate) =>
        candidate.surveyId === surveyId &&
        need.traineeIds.includes(candidate.employeeId) &&
        normalizeSkill(candidate.topic).includes(normalizeSkill(need.skillName)),
    )) {
      refs.push({
        source: 'DS03',
        recordId: `${survey.surveyId}:${survey.employeeId}`,
        field: 'Training_Topic',
        value: survey.topic,
        reason: `${survey.employeeId} requested training directly related to ${need.skillName}.`,
      });
    }
  }
  for (const goalId of need.evidence.bodGoals) {
    const goal = goals.get(goalId);
    if (!goal) continue;
    refs.push({
      source: 'DS05',
      recordId: goalId,
      field: 'Goal_Description',
      value: goal.value,
      reason: `BOD training goal evidence supports the ${need.skillName} initiative.`,
    });
  }
  return refs;
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
  const profiles = loadEmployeeScopeProfiles();
  const projects = loadProjectEvidence();
  const goals = loadGoalEvidence();
  const surveys = loadSurveyEvidence();

  if (targetTeam?.trim() || targetProficiency?.trim()) {
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
        const employeesWithRecordedGap = need.traineeIds.filter((id) => {
          const profile = profiles.get(id);
          return (
            scopedEmployeeIdSet.has(id) &&
            Boolean(profile && hasDirectSkillGap(profile, need.skillName))
          );
        });
        return {
          ...need,
          traineeIds: employeesWithRecordedGap,
          estimatedHours: estimateHours(employeesWithRecordedGap.length),
          targetQuarter: requestedQuarter ?? need.targetQuarter,
        };
      })
      .filter(
        (need) =>
          need.traineeIds.length > 0 ||
          need.evidence.projectIds.length > 0 ||
          need.evidence.bodGoals.length > 0,
      );
  } else if (requestedQuarter) {
    trainingNeeds = trainingNeeds.map((need) => ({
      ...need,
      targetQuarter: requestedQuarter,
    }));
  }

  trainingNeeds = trainingNeeds.map((need) => {
    const evidenceBackedTrainees = need.traineeIds.filter((employeeId) => {
      const profile = profiles.get(employeeId);
      return profile ? hasDirectSkillGap(profile, need.skillName) : false;
    });
    const evidenceScopedNeed = {
      ...need,
      traineeIds: evidenceBackedTrainees,
      estimatedHours: estimateHours(evidenceBackedTrainees.length),
    };
    return {
      ...evidenceScopedNeed,
      evidenceRefs: buildEvidenceRefs(evidenceScopedNeed, profiles, projects, goals, surveys),
    };
  });

  return {
    trainers: loadTrainersFromCSV(),
    trainingNeeds,
  };
}
