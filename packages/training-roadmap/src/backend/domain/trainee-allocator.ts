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

import type { EvidenceRef } from '../../types.ts';

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
export const SKILL_ALIAS_MAP: Record<string, string[]> = {
  Kubernetes: [
    'Containerization',
    'Docker',
    'K8s',
    'Container Orchestration',
    'Cloud',
    'Container',
  ],
  'CI/CD': [
    'DevOps',
    'Jenkins',
    'GitHub Actions',
    'GitLab CI',
    'Automation',
    'Pipeline',
    'Continuous Integration',
    'Continuous Deployment',
  ],
  IaC: [
    'Terraform',
    'Infrastructure as Code',
    'CloudFormation',
    'Ansible',
    'Cloud',
    'Infrastructure',
  ],
  Docker: ['Containerization', 'Container', 'K8s', 'Kubernetes'],
  'Cloud Services': ['AWS', 'GCP', 'Azure', 'Cloud', 'Multi-cloud'],
  Terraform: ['IaC', 'Infrastructure as Code', 'Cloud'],
  DevOps: ['CI/CD', 'Docker', 'Kubernetes', 'Automation', 'Pipeline'],
  AWS: ['Cloud', 'Cloud Services', 'Multi-cloud'],
  GCP: ['Cloud', 'Cloud Services', 'Multi-cloud'],
  Azure: ['Cloud', 'Cloud Services', 'Multi-cloud'],
};

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

export interface AllocatedTrainee {
  employeeId: string;
  evidenceRefs: EvidenceRef[];
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
function normalizeSkill(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9/]+/g, '');
}

/**
 * Check if two skill names match directly or via substring inclusion.
 */
function skillsMatchDirect(skillA: string, skillB: string): boolean {
  const a = normalizeSkill(skillA);
  const b = normalizeSkill(skillB);
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Get all alias terms for a given skill.
 */
function getAliases(skillName: string): string[] {
  // Direct match in alias map
  const directAliases = SKILL_ALIAS_MAP[skillName] ?? [];

  // Also check if skillName appears as an alias value in another entry
  const reverseAliases: string[] = [];
  for (const [canonical, aliases] of Object.entries(SKILL_ALIAS_MAP)) {
    if (aliases.some((alias) => skillsMatchDirect(alias, skillName)) && canonical !== skillName) {
      reverseAliases.push(canonical);
    }
  }

  return [...new Set([...directAliases, ...reverseAliases])];
}

/**
 * Check if a skill gap matches the target skill directly.
 */
function hasDirectSkillGap(gaps: string[], skillName: string): boolean {
  return gaps.some((gap) => skillsMatchDirect(gap, skillName));
}

/**
 * Check if a skill gap matches via semantic alias.
 */
function hasAliasSkillGap(
  gaps: string[],
  skillName: string,
): { matched: true; aliasUsed: string } | { matched: false } {
  const aliases = getAliases(skillName);
  for (const alias of aliases) {
    if (gaps.some((gap) => skillsMatchDirect(gap, alias))) {
      return { matched: true, aliasUsed: alias };
    }
  }
  return { matched: false };
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

  const aliases = [skillName, ...getAliases(skillName)];
  return currentSkills.some((skill) => aliases.some((alias) => skillsMatchDirect(skill, alias)));
}

/**
 * Check if employee belongs to a project that requires the target skill.
 */
function isInRequiringProject(
  _employeeId: string,
  skillName: string,
  projects: ProjectProfile[],
  requiredByProject?: string[],
): { matched: true; projectId: string } | { matched: false } {
  const projectFilter = requiredByProject?.length
    ? projects.filter((p) => requiredByProject.includes(p.projectId))
    : projects;

  const aliases = [skillName, ...getAliases(skillName)];
  for (const project of projectFilter) {
    const projectRequiresSkill = project.requiredSkills.some((reqSkill) =>
      aliases.some((alias) => skillsMatchDirect(reqSkill, alias)),
    );
    if (projectRequiresSkill) {
      return { matched: true, projectId: project.projectId };
    }
  }
  return { matched: false };
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
  requiredByBod?: string[];
  requiredByProject?: string[];
  projects: ProjectProfile[];
}): AllocatedTrainee[] {
  const { skillName, employees, targetGroup, requiredByProject, projects } = args;

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

  const allocated: AllocatedTrainee[] = [];

  for (const employee of candidates) {
    const evidenceRefs: EvidenceRef[] = [];

    // Rule 1: Direct skill gap match
    if (hasDirectSkillGap(employee.skillGaps, skillName)) {
      evidenceRefs.push({
        source: 'DS01',
        recordId: employee.employeeId,
        field: 'Skill_Gap',
        value: employee.rawSkillGap,
        reason: `${employee.position} has a direct recorded gap matching ${skillName}.`,
      });
    }

    // Rule 2: Semantic alias match
    if (evidenceRefs.length === 0) {
      const aliasResult = hasAliasSkillGap(employee.skillGaps, skillName);
      if (aliasResult.matched) {
        evidenceRefs.push({
          source: 'DS01',
          recordId: employee.employeeId,
          field: 'Skill_Gap',
          value: employee.rawSkillGap,
          reason: `${employee.position} has a semantically related gap "${aliasResult.aliasUsed}" matching ${skillName}.`,
        });
      }
    }

    // Rule 3: Low-proficiency related skill + BOD/project requirement
    if (
      evidenceRefs.length === 0 &&
      hasLowProficiencyRelatedSkill(employee.currentSkills, employee.proficiencyLevel, skillName)
    ) {
      evidenceRefs.push({
        source: 'DS01',
        recordId: employee.employeeId,
        field: 'Proficiency_Level',
        value: employee.proficiencyLevel,
        reason: `${employee.position} has related skill at ${employee.proficiencyLevel} level; ${skillName} is required by BOD/project goals.`,
      });
    }

    // Rule 4: Project membership
    if (evidenceRefs.length === 0) {
      const projectResult = isInRequiringProject(
        employee.employeeId,
        skillName,
        projects,
        requiredByProject,
      );
      if (projectResult.matched) {
        evidenceRefs.push({
          source: 'DS01',
          recordId: employee.employeeId,
          field: 'Position',
          value: employee.position,
          reason: `${employee.position} belongs to project ${projectResult.projectId} which requires ${skillName}.`,
        });
      }
    }

    // Only add if we found DS01 evidence
    if (evidenceRefs.length > 0) {
      allocated.push({
        employeeId: employee.employeeId,
        evidenceRefs,
      });
    }
  }

  return allocated;
}
