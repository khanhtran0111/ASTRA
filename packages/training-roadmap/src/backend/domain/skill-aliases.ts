export const SKILL_ALIASES: Record<string, string[]> = {
  docker: ['Docker', 'Containerization', 'Container', 'Containers', 'Containerized Deployment'],
  kubernetes: ['Kubernetes', 'K8s', 'Container Orchestration', 'Containerized Applications'],
  cicd: [
    'CI/CD',
    'CICD',
    'Continuous Integration',
    'Continuous Delivery',
    'Continuous Deployment',
    'Jenkins',
    'GitHub Actions',
    'GitLab CI',
    'Azure DevOps',
    'Deployment Pipeline',
    'Build Pipeline',
  ],
  iac: [
    'IaC',
    'Infrastructure as Code',
    'Terraform',
    'Ansible',
    'CloudFormation',
    'Pulumi',
    'Infrastructure Provisioning',
  ],
  cloudNative: [
    'Cloud-native',
    'Cloud native',
    'Docker',
    'Containerization',
    'Kubernetes',
    'K8s',
    'CI/CD',
    'IaC',
    'Terraform',
    'DevOps',
    'Cloud Services',
  ],
};

const CLOUD_NATIVE_UMBRELLA = ['Cloud-native', 'Cloud native', 'Cloud-first'];
const CLOUD_NATIVE_SKILLS = ['Docker', 'Containerization', 'Kubernetes', 'CI/CD', 'IaC'];

function textContainsTerm(value: string, term: string): boolean {
  if (normalizeSkill(value) === normalizeSkill(term)) return true;
  const tokenizedValue = ` ${value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
  const tokenizedTerm = ` ${term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
  return tokenizedValue.includes(tokenizedTerm);
}

export function normalizeSkill(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function skillsMatchDirect(skillA: string, skillB: string): boolean {
  const a = normalizeSkill(skillA);
  const b = normalizeSkill(skillB);
  if (a === b) return true;

  const tokenizedA = ` ${skillA
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
  const tokenizedB = ` ${skillB
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
  return tokenizedA.includes(tokenizedB) || tokenizedB.includes(tokenizedA);
}

export function getSkillAliases(skillName: string): string[] {
  const aliases = new Set<string>([skillName]);
  const families = matchingSkillFamilies(skillName);

  for (const [canonical, terms] of Object.entries(SKILL_ALIASES)) {
    if (canonical === 'cloudNative' || !families.includes(canonical)) continue;
    const allTerms = [canonical, ...terms];
    allTerms.forEach((term) => {
      aliases.add(term);
    });
  }

  return [...aliases];
}

function matchingSkillFamilies(value: string): string[] {
  const exactFamilies = Object.entries(SKILL_ALIASES).flatMap(([canonical, terms]) => {
    if (canonical === 'cloudNative') return [];
    return [canonical, ...terms].some((term) => normalizeSkill(term) === normalizeSkill(value))
      ? [canonical]
      : [];
  });
  if (exactFamilies.length > 0) return exactFamilies;

  return Object.entries(SKILL_ALIASES).flatMap(([canonical, terms]) => {
    if (canonical === 'cloudNative') return [];
    const valueTokenCount = value
      .trim()
      .split(/[^a-z0-9]+/i)
      .filter(Boolean).length;
    return [canonical, ...terms].some(
      (term) =>
        term
          .trim()
          .split(/[^a-z0-9]+/i)
          .filter(Boolean).length === valueTokenCount && skillsMatchDirect(term, value),
    )
      ? [canonical]
      : [];
  });
}

export function matchesSkill(candidate: string, requested: string): boolean {
  if (skillsMatchDirect(candidate, requested)) return true;

  const requestedFamilies = matchingSkillFamilies(requested);
  const candidateFamilies = matchingSkillFamilies(candidate);
  const sameSkillFamily = requestedFamilies.some((family) => candidateFamilies.includes(family));
  if (sameSkillFamily) return true;

  const candidateIsUmbrella = CLOUD_NATIVE_UMBRELLA.some((term) =>
    textContainsTerm(candidate, term),
  );
  const requestedIsUmbrella = CLOUD_NATIVE_UMBRELLA.some((term) =>
    textContainsTerm(requested, term),
  );
  const candidateIsCloudNativeSkill = CLOUD_NATIVE_SKILLS.some((term) =>
    skillsMatchDirect(candidate, term),
  );
  const requestedIsCloudNativeSkill = CLOUD_NATIVE_SKILLS.some((term) =>
    skillsMatchDirect(requested, term),
  );

  return (
    (candidateIsUmbrella && requestedIsCloudNativeSkill) ||
    (requestedIsUmbrella && candidateIsCloudNativeSkill)
  );
}

export function findMatchingSkill(candidates: string[], requested: string): string | null {
  return candidates.find((candidate) => matchesSkill(candidate, requested)) ?? null;
}
