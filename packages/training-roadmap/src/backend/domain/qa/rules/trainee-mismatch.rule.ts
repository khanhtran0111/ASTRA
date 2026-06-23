import { matchesSkill, normalizeSkill } from '../../skill-aliases.ts';
import type { QaFinding, QaNormalizedData, QaRoadmap } from '../qa-types.ts';

const normalize = (value: string) => normalizeSkill(value);

function requestedRole(prompt: string): string | null {
  for (const role of [
    'software developer',
    'software engineer',
    'frontend',
    'backend',
    'qa',
    'mobile',
  ]) {
    if (prompt.toLowerCase().includes(role)) return role;
  }
  return null;
}

function requestedProficiency(prompt: string): string | null {
  const value = prompt.toLowerCase();
  if (
    value.includes('mid-level') ||
    value.includes('mid level') ||
    value.includes('intermediate')
  ) {
    return 'intermediate';
  }
  if (value.includes('junior') || value.includes('beginner')) return 'beginner';
  if (value.includes('senior') || value.includes('advanced')) return 'advanced';
  return null;
}

export function checkTraineeMismatch(
  roadmap: QaRoadmap,
  normalizedData: QaNormalizedData,
  userPrompt = '',
): QaFinding[] {
  const employees = new Map(
    (normalizedData.employees ?? []).map((employee) => [employee.id, employee]),
  );
  const findings: QaFinding[] = [];
  const role = requestedRole(userPrompt);
  const proficiency = requestedProficiency(userPrompt);

  roadmap.items.forEach((item, itemIndex) => {
    if (!item.traineeIds || item.traineeIds.length === 0) {
      findings.push({
        type: 'NO_TRAINEE_EVIDENCE',
        severity: 'HIGH',
        skill: item.skill,
        relatedInitiativeId: item.initiativeId,
        message: `No DS01 evidence-backed trainee is available for ${item.skill}.`,
        evidence: [
          { path: `roadmap.items[${itemIndex}].traineeIds`, value: item.traineeIds ?? [] },
          { path: 'request.userPrompt', value: userPrompt },
        ],
      });
      return;
    }
    item.traineeIds?.forEach((traineeId, traineeIndex) => {
      const employee = employees.get(traineeId);
      if (!employee) return;
      const hasSkillGap = employee.targetSkills.some((skill) => matchesSkill(skill, item.skill));
      const matchesRole = role
        ? normalize(employee.position ?? '').includes(normalize(role))
        : true;
      const matchesProficiency = proficiency
        ? normalize(employee.proficiency ?? '') === proficiency
        : true;
      const hasGranularDs01Evidence = (item.evidence ?? []).some(
        (evidence) =>
          evidence.source === 'DS01' &&
          evidence.recordId === traineeId &&
          evidence.field === 'Skill_Gap',
      );
      if (!hasSkillGap || !matchesRole || !matchesProficiency || !hasGranularDs01Evidence) {
        findings.push({
          type: 'NO_TRAINEE_EVIDENCE',
          severity: 'HIGH',
          skill: item.skill,
          relatedInitiativeId: item.initiativeId,
          message: `${traineeId} lacks matching DS01 role, proficiency, or skill-gap evidence for ${item.skill}.`,
          evidence: [
            {
              path: `roadmap.items[${itemIndex}].traineeIds[${traineeIndex}]`,
              value: traineeId,
            },
            {
              path: `normalizedData.employees[id=${traineeId}].targetSkills`,
              value: employee.targetSkills,
            },
            { path: 'request.userPrompt', value: userPrompt },
            {
              path: `roadmap.items[${itemIndex}].evidence[source=DS01,recordId=${traineeId}]`,
              value: hasGranularDs01Evidence,
            },
          ],
        });
      }
    });
  });

  return findings;
}
