import { matchesSkill, normalizeSkill } from './skill-aliases.ts';

export interface RoadmapConstraints {
  requestedQuarter?: string;
  requestedInitiativeCount?: number;
  requestedTopics?: string[];
  targetRoles?: string[];
  targetSkillGaps?: string[];
  maxTrainees?: number;
  requiredProjectIds?: string[];
  requiredGoalIds?: string[];
  trainerPreferenceSkills?: string[];
  allowFallback?: boolean;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function parseRoadmapConstraints(prompt: string): RoadmapConstraints {
  const text = prompt.trim();
  const lower = text.toLowerCase();
  const constraints: RoadmapConstraints = {};

  const quarter = /Q([1-4])\D*(20\d{2})/i.exec(text);
  if (quarter) constraints.requestedQuarter = `Q${quarter[1]}_${quarter[2]}`;

  if (
    /(?:tạo|create)\s+(?:chỉ\s+)?(?:1|một|one)\s+(?:training\s+)?initiative/i.test(text) ||
    /(?:chỉ|only)\s+(?:tạo\s+|create\s+)?(?:1|một|one)\s+(?:training\s+)?initiative/i.test(text)
  ) {
    constraints.requestedInitiativeCount = 1;
  }

  const maxMatch =
    /(?:tối đa|không quá|maximum|max|up to)\s*(\d+)\s*(?:trainees?|người|nhân sự)?/i.exec(text);
  if (maxMatch?.[1]) constraints.maxTrainees = Number.parseInt(maxMatch[1], 10);

  const projectIds = text.match(/\bPRJ-\d{3}\b/g);
  if (projectIds) constraints.requiredProjectIds = unique(projectIds);

  const goalIds = text.match(/\bGOAL-\d{4}-\d{2}\b/g);
  if (goalIds) constraints.requiredGoalIds = unique(goalIds);

  if (/software developer/i.test(text)) constraints.targetRoles = ['Software Developer'];
  else if (/software engineer/i.test(text)) constraints.targetRoles = ['Software Engineer'];
  else if (/\bdeveloper/i.test(text)) constraints.targetRoles = ['Developer'];

  const topics: string[] = [];
  const skillGaps: string[] = [];
  if (/docker/i.test(text)) topics.push('Docker');
  if (/containerization|containerisation/i.test(text)) {
    topics.push('Containerization');
    skillGaps.push('Containerization');
  }
  if (/kubernetes|\bk8s\b/i.test(text)) topics.push('Kubernetes');
  if (/\bci\/cd\b|\bcicd\b|continuous integration|github actions|jenkins/i.test(text)) {
    topics.push('CI/CD');
  }
  if (/\biac\b|terraform|ansible|infrastructure as code/i.test(text)) topics.push('IaC');

  if (topics.length > 0) constraints.requestedTopics = unique(topics);
  if (skillGaps.length > 0) constraints.targetSkillGaps = unique(skillGaps);

  if (/expertise\s+docker|docker/i.test(text)) constraints.trainerPreferenceSkills = ['Docker'];
  constraints.allowFallback = /self-study|self study|blended|external|fallback|tự học/i.test(lower);

  return constraints;
}

export function skillMatchesRequestedTopics(skillName: string, constraints: RoadmapConstraints) {
  if (!constraints.requestedTopics?.length) return true;
  const requestedDocker = constraints.requestedTopics.some(
    (topic) => normalizeSkill(topic) === 'docker',
  );
  const requestedKubernetes = constraints.requestedTopics.some((topic) =>
    /kubernetes|k8s/.test(normalizeSkill(topic)),
  );
  const normalizedSkillName = normalizeSkill(skillName);

  if (requestedDocker && !requestedKubernetes && /kubernetes|k8s/.test(normalizedSkillName)) {
    return false;
  }

  if (requestedDocker) return matchesSkill(skillName, 'Docker');

  return constraints.requestedTopics.some((topic) => matchesSkill(skillName, topic));
}

export function requestedDisplayTopic(skillName: string, constraints: RoadmapConstraints): string {
  const topics = constraints.requestedTopics ?? [];
  if (
    topics.some((topic) => matchesSkill(topic, 'Docker')) &&
    topics.some((topic) => matchesSkill(topic, 'Containerization'))
  ) {
    return 'Docker & Containerization Foundation';
  }
  return skillName;
}

export function enforcePromptScope<T extends { topic: string; quarter: string }>(
  initiatives: T[],
  constraints: RoadmapConstraints,
): T[] {
  const requestedQuarter = constraints.requestedQuarter?.replace('_', ' ');
  const inScope = initiatives.filter((initiative) =>
    skillMatchesRequestedTopics(initiative.topic, constraints),
  );
  const limited = constraints.requestedInitiativeCount
    ? inScope.slice(0, constraints.requestedInitiativeCount)
    : inScope;

  return limited.map((initiative) => ({
    ...initiative,
    topic: requestedDisplayTopic(initiative.topic, constraints),
    quarter: requestedQuarter ?? initiative.quarter,
  }));
}
