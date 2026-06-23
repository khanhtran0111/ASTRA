/**
 * Coverage Calculator — BOD percentage goal computation.
 *
 * When a BOD goal or user prompt contains a percentage target
 * (e.g., "upskill at least 60% development team"), this module
 * computes whether the selected trainees meet the coverage requirement.
 *
 * No LLM involvement — deterministic calculation.
 */

import { type EmployeeProfile, isDevelopmentTeam } from './trainee-allocator.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CoverageResult {
  targetGroup: string;
  totalEligibleEmployees: number;
  requiredCoveragePercent: number;
  requiredTraineeCount: number;
  selectedTraineeCount: number;
  achievedCoveragePercent: number;
  coverageStatus: 'MET' | 'NOT_MET';
  missingTraineeCount: number;
}

export interface CoverageTarget {
  targetGroup: string;
  requiredPercent: number;
}

// ---------------------------------------------------------------------------
// Prompt Parsing
// ---------------------------------------------------------------------------

/**
 * Extract coverage target from a user prompt.
 *
 * Supports patterns like:
 *   - "upskill at least 60% development team"
 *   - "upskill ít nhất 60% development team"
 *   - "train 80% of the engineering team"
 *   - "đào tạo 70% đội phát triển"
 */
export function parseCoverageTarget(userPrompt: string): CoverageTarget | null {
  if (!userPrompt) return null;

  // Pattern: number followed by % with optional surrounding text about a group
  // Vietnamese: "ít nhất X%", "tối thiểu X%"
  // English: "at least X%", "minimum X%"
  const percentPatterns = [
    // "ít nhất 60% development team" / "at least 60% development team"
    /(?:ít nhất|tối thiểu|at least|minimum|over|trên)\s+(\d+)\s*%\s*(?:of\s+)?(?:the\s+)?(.+?)(?:\s+(?:về|about|regarding|gồm|including|cho)|\s*$)/i,
    // "60% development team" (standalone)
    /(\d+)\s*%\s*(?:of\s+)?(?:the\s+)?(.+?)(?:\s+(?:về|about|regarding|gồm|including|cho)|\s*$)/i,
    // "upskill 60% development team"
    /(?:upskill|train|đào tạo|nâng cao)\s+(?:ít nhất|tối thiểu|at least)?\s*(\d+)\s*%\s*(?:of\s+)?(?:the\s+)?(.+?)(?:\s+(?:về|about|regarding|gồm|including|cho)|\s*$)/i,
  ];

  for (const pattern of percentPatterns) {
    const match = pattern.exec(userPrompt);
    if (match) {
      const percentRaw = match[1];
      const groupRaw = match[2];
      if (!percentRaw || !groupRaw) {
        continue;
      }

      const percent = Number.parseInt(percentRaw, 10);
      const group = groupRaw.trim();

      if (percent > 0 && percent <= 100 && group.length > 0) {
        return {
          targetGroup: normalizeGroupName(group),
          requiredPercent: percent,
        };
      }
    }
  }

  return null;
}

/**
 * Normalize group names from various Vietnamese/English forms.
 */
function normalizeGroupName(raw: string): string {
  const lower = raw.toLowerCase().trim();

  // Remove trailing punctuation and common stop words
  const cleaned = lower
    .replace(/[.,;:!?]+$/g, '')
    .replace(/\s+team$/g, ' team')
    .trim();

  // Map Vietnamese terms
  if (cleaned.includes('phát triển') || cleaned.includes('lập trình') || cleaned.includes('dev')) {
    return 'development team';
  }
  if (cleaned.includes('kỹ thuật') || cleaned.includes('engineering')) {
    return 'engineering team';
  }
  if (cleaned.includes('development') || cleaned.includes('developer')) {
    return 'development team';
  }

  return cleaned;
}

// ---------------------------------------------------------------------------
// Coverage Calculation
// ---------------------------------------------------------------------------

/**
 * Count eligible employees in the target group.
 */
function countEligibleEmployees(employees: EmployeeProfile[], targetGroup: string): number {
  const lower = targetGroup.toLowerCase();

  if (lower.includes('development') || lower.includes('dev') || lower.includes('engineering')) {
    return employees.filter((emp) => isDevelopmentTeam(emp.position)).length;
  }

  // Fallback: count all employees
  return employees.length;
}

/**
 * Calculate BOD percentage coverage.
 *
 * Given a set of employees, a target group, and a percentage goal,
 * computes whether the selected trainees meet the coverage requirement.
 */
export function calculateCoverage(args: {
  employees: EmployeeProfile[];
  targetGroup: string;
  requiredCoveragePercent: number;
  selectedTraineeIds: string[];
}): CoverageResult {
  const { employees, targetGroup, requiredCoveragePercent, selectedTraineeIds } = args;

  const totalEligible = countEligibleEmployees(employees, targetGroup);
  const requiredCount = Math.ceil((totalEligible * requiredCoveragePercent) / 100);
  const selectedCount = selectedTraineeIds.length;
  const achievedPercent =
    totalEligible > 0 ? Math.round((selectedCount / totalEligible) * 10000) / 100 : 0;
  const missing = Math.max(0, requiredCount - selectedCount);

  return {
    targetGroup,
    totalEligibleEmployees: totalEligible,
    requiredCoveragePercent,
    requiredTraineeCount: requiredCount,
    selectedTraineeCount: selectedCount,
    achievedCoveragePercent: achievedPercent,
    coverageStatus: selectedCount >= requiredCount ? 'MET' : 'NOT_MET',
    missingTraineeCount: missing,
  };
}
