export type TrainingRoadmapPromptIntent =
  | 'TRAINING_ROADMAP'
  | 'TASK_SEARCH'
  | 'TASK_ASSIGNMENT'
  | 'PEOPLE_SEARCH'
  | 'GENERAL_ASSISTANT';

export type PromptDestination = 'TRAINING_ROADMAP' | 'AGENT_CHAT';

export interface TrainingRoadmapPromptClassification {
  intent: TrainingRoadmapPromptIntent;
  destination: PromptDestination;
  reason: string;
}

function searchable(prompt: string): string {
  return prompt.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function has(value: string, pattern: RegExp): boolean {
  return pattern.test(value);
}

const TRAINING_SIGNAL =
  /\b(training|learning|roadmap|course|curriculum|initiative|trainee|upskill|reskill|workshop|lo trinh|dao tao|khoa hoc|hoc tap)\b/;
const TASK_SIGNAL = /\b(task|tasks|ticket|tickets|issue|issues|work item|cong viec|nhiem vu)\b/;
const TASK_LOOKUP_SIGNAL =
  /\b(find|search|locate|look up|lookup|show|list|open|tim|tra cuu|liet ke)\b/;
const ASSIGNMENT_SIGNAL =
  /\b(assign|assignment|assignee|best person|best candidate|who should|recommend|recommendation|suggest|goi y|giao viec|phan cong|nguoi phu hop)\b/;
const PERSON_SIGNAL =
  /\b(who|person|people|engineer|employee|candidate|user|someone|nguoi|nhan vien|ung vien)\b/;
const SKILL_SIGNAL = /\b(skill|skills|know|knows|experience|expertise|ky nang|kinh nghiem)\b/;
const GENERAL_SIGNAL =
  /^(who|what|when|where|why|how|find|search|suggest|recommend|assign|show|list|tell me|explain|summarize|hello|hi|xin chao|tim|goi y|ai|cai gi|tai sao|nhu the nao)\b/;

/**
 * A high-confidence domain gate for the dedicated Training Roadmap endpoint.
 *
 * This is deliberately not a broad LLM classifier. The endpoint keeps accepting
 * short roadmap constraint fragments such as "React testing in Q3", while
 * explicit task/people/general requests are handed to the generic Agent Chat.
 */
export function classifyTrainingRoadmapPrompt(
  userPrompt: string,
): TrainingRoadmapPromptClassification {
  const prompt = searchable(userPrompt);
  if (!prompt) {
    return {
      intent: 'TRAINING_ROADMAP',
      destination: 'TRAINING_ROADMAP',
      reason: 'An empty prompt requests the default evidence-backed roadmap.',
    };
  }

  const training = has(prompt, TRAINING_SIGNAL);
  const task = has(prompt, TASK_SIGNAL);
  const taskLookup = has(prompt, TASK_LOOKUP_SIGNAL);
  const assignment = has(prompt, ASSIGNMENT_SIGNAL);

  if (assignment && ((task && !training) || (taskLookup && (!training || task)))) {
    return {
      intent: 'TASK_ASSIGNMENT',
      destination: 'AGENT_CHAT',
      reason: 'The prompt asks to resolve a task and recommend or assign a person.',
    };
  }

  if (task && taskLookup && !training) {
    return {
      intent: 'TASK_SEARCH',
      destination: 'AGENT_CHAT',
      reason: 'The prompt asks to search planner tasks rather than generate training.',
    };
  }

  if (has(prompt, PERSON_SIGNAL) && has(prompt, SKILL_SIGNAL) && !training) {
    return {
      intent: 'PEOPLE_SEARCH',
      destination: 'AGENT_CHAT',
      reason: 'The prompt asks for people by skill rather than trainees for a roadmap.',
    };
  }

  if (training) {
    return {
      intent: 'TRAINING_ROADMAP',
      destination: 'TRAINING_ROADMAP',
      reason: 'The prompt explicitly requests a training or learning deliverable.',
    };
  }

  if (has(prompt, GENERAL_SIGNAL)) {
    return {
      intent: 'GENERAL_ASSISTANT',
      destination: 'AGENT_CHAT',
      reason: 'The prompt is a general assistant request, not a roadmap constraint.',
    };
  }

  return {
    intent: 'TRAINING_ROADMAP',
    destination: 'TRAINING_ROADMAP',
    reason: 'The prompt is treated as a concise training-roadmap constraint.',
  };
}
