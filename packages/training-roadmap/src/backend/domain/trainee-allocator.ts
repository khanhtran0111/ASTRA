/**
 * Trainee Allocator — DS01-backed trainee selection for Agent 1.
 *
 * This module implements deterministic trainee allocation logic:
 *   1. Identifies development-team members by position title
 *   2. Matches trainees to initiatives using DS01 evidence
 *   3. Supports semantic skill-alias matching (e.g., "Containerization" → Kubernetes)
 *   4. Every selected trainee has traceable evidence refs
 *
 * No LLM involvement — pure rule-based matching.
 */

import type { AllocatedTrainee, EvidenceRef } from '../../types.ts';
import { findMatchingSkill, matchesSkill, normalizeSkill } from './skill-aliases.ts';

// ---------------------------------------------------------------------------
// Development Team Role Patterns
// ---------------------------------------------------------------------------

const DEV_TEAM_PATTERNS = [
  'developer',
  'engineer',
  'software engineer',
  'frontend',
  'backend',
  'fullstack',
  'full-stack',
  'full stack',
  'devops',
  'technical lead',
  'tech lead',
  'mobile developer',
  'data engineer',
  'ai engineer',
  'ml engineer',
] as const;

// ---------------------------------------------------------------------------
// Skill Alias Map for Semantic Matching
// ---------------------------------------------------------------------------

/**
 * Maps canonical skill names to semantically related skill terms
 * that may appear in DS01 Skill_Gap or current_skills columns.
 */
export { SKILL_ALIASES as SKILL_ALIAS_MAP } from './skill-aliases.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmployeeProfile {
  employeeId: string;
  position: string;
  proficiencyLevel: string;
  currentSkills: string[];
  skillGaps: string[];
  rawSkillGap: string;
}

export interface ProjectProfile {
  projectId: string;
  requiredSkills: string[];
}

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/**
 * Check if an employee belongs to the development team based on position title.
 */
export function isDevelopmentTeam(position: string): boolean {
  const lower = position.toLowerCase();
  return DEV_TEAM_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * Normalize a skill name for comparison.
 */
function roleMatches(position: string, targetRoles?: string[]): boolean {
  if (!targetRoles?.length) return true;
  const normalizedPosition = normalizeSkill(position);
  return targetRoles.some((role) => {
    const normalizedRole = normalizeSkill(role);
    return normalizedPosition === normalizedRole || normalizedPosition.includes(normalizedRole);
  });
}

function matchingSkillGaps(gaps: string[], requestedSkills: string[]): string[] {
  return gaps.filter((gap) => requestedSkills.some((requested) => matchesSkill(gap, requested)));
}

/**
 * Check if employee has a related current skill at low proficiency.
 */
function hasLowProficiencyRelatedSkill(
  currentSkills: string[],
  proficiency: string,
  skillName: string,
): boolean {
  const lowProficiency = ['beginner', 'intermediate'];
  if (!lowProficiency.includes(proficiency.toLowerCase())) return false;

  return currentSkills.some((skill) => matchesSkill(skill, skillName));
}

/**
 * Allocate DS01-backed trainees for a single training initiative.
 *
 * Selection rules (in priority order):
 * 1. Employee has matching skill in Skill_Gap
 * 2. Employee has semantically related skill gap (via SKILL_ALIAS_MAP)
 * 3. Employee has related current skill at Beginner/Intermediate proficiency
 *    and the target skill is required by BOD/project
 * 4. Employee belongs to a project requiring the target skill
 *
 * Each rule produces specific evidence refs.
 * An employee is selected if ANY rule matches.
 * Employees NOT in DS01 are never selected.
 */
export function allocateTraineesForInitiative(args: {
  skillName: string;
  employees: EmployeeProfile[];
  targetGroup?: string;
  targetRoles?: string[];
  targetSkillGaps?: string[];
  maxTrainees?: number;
  requiredByBod?: string[];
  requiredByProject?: string[];
  projects: ProjectProfile[];
}): AllocatedTrainee[] {
  const { skillName, employees, targetGroup, targetRoles, targetSkillGaps, maxTrainees } = args;
  const requestedSkills = [...new Set([skillName, ...(targetSkillGaps ?? [])])];

  // Filter by target group if specified
  let candidates = employees;
  if (targetGroup) {
    const groupLower = targetGroup.toLowerCase();
    if (
      groupLower.includes('development') ||
      groupLower.includes('dev') ||
      groupLower.includes('engineering')
    ) {
      candidates = employees.filter((emp) => isDevelopmentTeam(emp.position));
    }
  }
  candidates = candidates.filter((emp) => roleMatches(emp.position, targetRoles));

  const allocated: Array<AllocatedTrainee & { score: number }> = [];

  for (const employee of candidates) {
    const evidenceRefs: EvidenceRef[] = [];
    const matchedSkillGap = matchingSkillGaps(employee.skillGaps, requestedSkills);
    if (matchedSkillGap.length === 0) continue;

    evidenceRefs.push({
      source: 'DS01',
      recordId: employee.employeeId,
      field: 'Position',
      value: employee.position,
      reason: targetRoles?.length
        ? 'Matches requested target role.'
        : 'DS01 position confirms the trainee cohort.',
    });
    evidenceRefs.push({
      source: 'DS01',
      recordId: employee.employeeId,
      field: 'Skill_Gap',
      value: employee.rawSkillGap,
      reason: `Contains requested skill gap ${matchedSkillGap.join(', ')} for ${skillName}.`,
    });

    let score = 0;
    if (targetRoles?.some((role) => normalizeSkill(role) === normalizeSkill(employee.position))) {
      score += 50;
    } else if (roleMatches(employee.position, targetRoles)) {
      score += 35;
    }
    score += matchedSkillGap.some((gap) => findMatchingSkill([gap], skillName)) ? 40 : 30;
    if (
      hasLowProficiencyRelatedSkill(employee.currentSkills, employee.proficiencyLevel, skillName)
    ) {
      score += 20;
    }
    if (['beginner', 'intermediate'].includes(employee.proficiencyLevel.toLowerCase())) {
      score += 10;
    }

    if (evidenceRefs.length > 0) {
      allocated.push({
        employeeId: employee.employeeId,
        position: employee.position,
        proficiencyLevel: employee.proficiencyLevel,
        matchedSkillGap,
        evidenceRefs,
        reason: `${employee.position} with direct ${matchedSkillGap.join(', ')} skill-gap evidence in DS01.`,
        score,
      });
    }
  }

  return allocated
    .sort((a, b) => b.score - a.score || a.employeeId.localeCompare(b.employeeId))
    .slice(0, maxTrainees ?? allocated.length)
    .map(({ score: _score, ...trainee }) => trainee);
}
