/**
 * Fallback Plan Generator — structured learning plans for missing trainers.
 *
 * When no internal trainer is available (TRAINER_NOT_FOUND or CAPACITY_EXCEEDED),
 * Agent 1 generates a fallback learning plan instead of blocking.
 *
 * Cloud-native topic-specific rules:
 *   - Kubernetes: prefer external or blended
 *   - CI/CD: allow self-study + study-group
 *   - IaC: allow self-study + lab-based
 *   - Default: self-study or external
 *
 * No LLM involvement — deterministic template-based generation.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FallbackLearningMode =
  | 'self-study'
  | 'external'
  | 'study-group'
  | 'blended'
  | 'lab-based';

export type FallbackReasonType = 'TRAINER_NOT_FOUND' | 'CAPACITY_EXCEEDED';

export interface FallbackMilestone {
  week: number;
  description: string;
  deliverable: string;
}

export interface FallbackPlan {
  learningMode: FallbackLearningMode;
  pic: string;
  materials: string[];
  milestones: FallbackMilestone[];
  estimatedHours: number;
  evaluationCriteria: string;
}

// ---------------------------------------------------------------------------
// Cloud-native Topic Rules
// ---------------------------------------------------------------------------

interface TopicRule {
  preferredModes: FallbackLearningMode[];
  materials: string[];
  evaluationTemplate: string;
  milestoneTemplates: Array<{ weekOffset: number; description: string; deliverable: string }>;
}

const CLOUD_NATIVE_RULES: Record<string, TopicRule> = {
  docker: {
    preferredModes: ['blended', 'self-study'],
    materials: [
      'Docker official getting started guide',
      'Internal hands-on lab: containerize a sample service',
      'Project-based checklist mapped to PRJ-005',
    ],
    evaluationTemplate:
      'Trainee submits a working Dockerfile and runs a containerized sample application.',
    milestoneTemplates: [
      {
        weekOffset: 1,
        description: 'Docker fundamentals and image/container lifecycle',
        deliverable: 'Run and inspect containers locally',
      },
      {
        weekOffset: 2,
        description: 'Dockerfile and local container workflow',
        deliverable: 'Build a reusable Docker image for a sample service',
      },
      {
        weekOffset: 3,
        description: 'docker compose and multi-service setup',
        deliverable: 'Run a multi-service environment with docker compose',
      },
      {
        weekOffset: 4,
        description: 'Containerize sample app and peer review',
        deliverable: 'Peer-reviewed Dockerfile and runbook mapped to PRJ-005',
      },
    ],
  },
  containerization: {
    preferredModes: ['blended', 'self-study'],
    materials: [
      'Docker official getting started guide',
      'Internal hands-on lab: containerize a sample service',
      'Project-based checklist mapped to PRJ-005',
    ],
    evaluationTemplate:
      'Trainee submits a working Dockerfile and runs a containerized sample application.',
    milestoneTemplates: [
      {
        weekOffset: 1,
        description: 'Docker fundamentals and image/container lifecycle',
        deliverable: 'Run and inspect containers locally',
      },
      {
        weekOffset: 2,
        description: 'Dockerfile and local container workflow',
        deliverable: 'Build a reusable Docker image for a sample service',
      },
      {
        weekOffset: 3,
        description: 'docker compose and multi-service setup',
        deliverable: 'Run a multi-service environment with docker compose',
      },
      {
        weekOffset: 4,
        description: 'Containerize sample app and peer review',
        deliverable: 'Peer-reviewed Dockerfile and runbook mapped to PRJ-005',
      },
    ],
  },
  kubernetes: {
    preferredModes: ['external', 'blended'],
    materials: [
      'CKA/CKAD certification prep course',
      'Kubernetes official documentation',
      'Hands-on lab environment (Minikube/Kind)',
      'Kubernetes The Hard Way tutorial',
    ],
    evaluationTemplate:
      'Deploy a multi-service application on a Kubernetes cluster; pass CKA practice exam with ≥80%.',
    milestoneTemplates: [
      {
        weekOffset: 1,
        description: 'Complete core concepts: Pods, Services, Deployments',
        deliverable: 'Deploy a 3-tier app on local K8s cluster',
      },
      {
        weekOffset: 3,
        description: 'Networking, storage, and security policies',
        deliverable: 'Configure Ingress, PV/PVC, and NetworkPolicy',
      },
      {
        weekOffset: 5,
        description: 'Helm charts and cluster operations',
        deliverable: 'Package application with Helm; perform rolling updates',
      },
      {
        weekOffset: 7,
        description: 'Practice exam and knowledge assessment',
        deliverable: 'Pass mock CKA exam ≥80%',
      },
    ],
  },
  'ci/cd': {
    preferredModes: ['self-study', 'study-group'],
    materials: [
      'GitHub Actions / GitLab CI documentation',
      'CI/CD pipeline design patterns guide',
      'Internal project repositories (existing pipelines)',
      'DevOps Handbook reference chapters',
    ],
    evaluationTemplate:
      'Design and implement a complete CI/CD pipeline for a sample project with build, test, deploy stages.',
    milestoneTemplates: [
      {
        weekOffset: 1,
        description: 'CI fundamentals: build, lint, unit test automation',
        deliverable: 'Working CI pipeline with automated tests',
      },
      {
        weekOffset: 3,
        description: 'CD fundamentals: staging, production deployments',
        deliverable: 'Multi-stage deployment pipeline',
      },
      {
        weekOffset: 5,
        description: 'Advanced: caching, matrix builds, security scanning',
        deliverable: 'Optimized pipeline with security gates',
      },
    ],
  },
  iac: {
    preferredModes: ['self-study', 'lab-based'],
    materials: [
      'Terraform documentation and tutorials',
      'HashiCorp Learn platform',
      'Cloud provider IaC quickstarts (AWS CDK / CloudFormation)',
      'Infrastructure as Code best practices guide',
    ],
    evaluationTemplate:
      'Provision a complete cloud environment using IaC tools; demonstrate state management and module reuse.',
    milestoneTemplates: [
      {
        weekOffset: 1,
        description: 'IaC fundamentals: declarative vs imperative, state',
        deliverable: 'Provision a VPC + EC2 with Terraform',
      },
      {
        weekOffset: 3,
        description: 'Modules, variables, and remote state',
        deliverable: 'Refactored infra as reusable modules',
      },
      {
        weekOffset: 5,
        description: 'Multi-environment and drift detection',
        deliverable: 'Staging + production environments from same codebase',
      },
    ],
  },
  terraform: {
    preferredModes: ['self-study', 'lab-based'],
    materials: [
      'HashiCorp Learn — Terraform track',
      'Terraform Registry module examples',
      'Cloud provider documentation',
      'Terraform Up & Running book',
    ],
    evaluationTemplate:
      'Build a multi-module Terraform project with remote state; pass HashiCorp Terraform Associate practice exam.',
    milestoneTemplates: [
      {
        weekOffset: 1,
        description: 'HCL syntax, providers, resources',
        deliverable: 'Deploy basic cloud resources with Terraform',
      },
      {
        weekOffset: 3,
        description: 'Modules, workspaces, remote backends',
        deliverable: 'Multi-workspace setup with S3 backend',
      },
      {
        weekOffset: 5,
        description: 'Advanced patterns and certification prep',
        deliverable: 'Pass practice exam ≥70%',
      },
    ],
  },
};

const DEFAULT_RULE: TopicRule = {
  preferredModes: ['self-study', 'external'],
  materials: [
    'Official documentation and tutorials',
    'Online learning platform courses (Udemy/Coursera/Pluralsight)',
    'Industry best practices guides',
    'Hands-on exercises and projects',
  ],
  evaluationTemplate:
    'Complete a practical project demonstrating core competencies; pass knowledge assessment ≥70%.',
  milestoneTemplates: [
    {
      weekOffset: 1,
      description: 'Foundational concepts and setup',
      deliverable: 'Complete introductory modules; setup local environment',
    },
    {
      weekOffset: 3,
      description: 'Core skills practice',
      deliverable: 'Complete intermediate exercises',
    },
    {
      weekOffset: 5,
      description: 'Applied project and assessment',
      deliverable: 'Deliver practical project; pass knowledge assessment',
    },
  ],
};

// ---------------------------------------------------------------------------
// Fallback Plan Generator
// ---------------------------------------------------------------------------

function getTopicRule(skillName: string): TopicRule {
  const lower = skillName.toLowerCase();
  for (const [key, rule] of Object.entries(CLOUD_NATIVE_RULES)) {
    if (lower === key || lower.includes(key) || key.includes(lower)) {
      return rule;
    }
  }
  return DEFAULT_RULE;
}

/**
 * Select the best learning mode based on the fallback reason and topic rules.
 *
 * - CAPACITY_EXCEEDED: prefer self-study/study-group (internal alternatives)
 * - TRAINER_NOT_FOUND: use the topic's preferred modes
 */
function selectLearningMode(
  reason: FallbackReasonType,
  preferredModes: FallbackLearningMode[],
): FallbackLearningMode {
  if (reason === 'CAPACITY_EXCEEDED') {
    // Prefer internal alternatives when trainers exist but are overloaded
    const internalAlternatives: FallbackLearningMode[] = ['study-group', 'self-study', 'blended'];
    const match = internalAlternatives.find((mode) => preferredModes.includes(mode));
    return match ?? preferredModes[0] ?? 'self-study';
  }
  return preferredModes[0] ?? 'external';
}

/**
 * Generate a complete fallback learning plan.
 *
 * The plan is deterministic — same inputs always produce same outputs.
 * It includes learning mode, materials, milestones, and evaluation criteria
 * tailored to cloud-native topics.
 */
export function generateFallbackPlan(args: {
  skillName: string;
  fallbackReason: FallbackReasonType;
  estimatedHours: number;
  traineeCount: number;
}): FallbackPlan {
  const { skillName, fallbackReason, estimatedHours, traineeCount } = args;
  const rule = getTopicRule(skillName);

  const learningMode = selectLearningMode(fallbackReason, rule.preferredModes);

  // Adjust PIC based on learning mode
  const pic =
    learningMode === 'external'
      ? 'L&D Manager (external vendor coordination)'
      : learningMode === 'study-group'
        ? 'Team Lead / Senior Engineer (study group facilitator)'
        : learningMode === 'blended'
          ? 'L&D Manager + Team Lead (blended coordination)'
          : learningMode === 'lab-based'
            ? 'DevOps Lead / Platform Engineer (lab environment)'
            : 'Individual Learner (self-directed, L&D monitoring)';

  // Generate milestones from templates
  const milestones: FallbackMilestone[] = rule.milestoneTemplates.map((template) => ({
    week: template.weekOffset,
    description: template.description,
    deliverable: template.deliverable,
  }));

  // Add study-group specific adjustments
  const materials = [...rule.materials];
  if (learningMode === 'study-group' && traineeCount > 1) {
    materials.push(`Study group sessions (${traineeCount} participants, weekly)`);
  }
  if (learningMode === 'lab-based') {
    materials.push('Dedicated lab/sandbox environment for hands-on practice');
  }

  return {
    learningMode,
    pic,
    materials,
    milestones,
    estimatedHours,
    evaluationCriteria: rule.evaluationTemplate,
  };
}

/**
 * Check if a fallback plan is complete (has all required fields).
 */
export function isFallbackPlanComplete(plan: FallbackPlan | undefined | null): boolean {
  if (!plan) return false;
  return (
    Boolean(plan.learningMode) &&
    Boolean(plan.pic) &&
    plan.materials.length > 0 &&
    plan.milestones.length > 0 &&
    plan.estimatedHours > 0 &&
    Boolean(plan.evaluationCriteria)
  );
}
