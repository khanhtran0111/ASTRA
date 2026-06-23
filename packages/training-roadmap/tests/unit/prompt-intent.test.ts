import { describe, expect, it } from 'vitest';
import { classifyTrainingRoadmapPrompt } from '../../src/backend/domain/prompt-intent.ts';

describe('training roadmap prompt intent', () => {
  it('routes task lookup plus assignee recommendation to staffing', () => {
    expect(
      classifyTrainingRoadmapPrompt(
        'Find the task `Audit Kubernetes cluster security and RBAC policies`, then suggest the best person to assign it to.',
      ),
    ).toMatchObject({
      intent: 'TASK_ASSIGNMENT',
      destination: 'AGENT_CHAT',
    });
  });

  it('recognizes a task-assignment command even when the user omits the word task', () => {
    expect(
      classifyTrainingRoadmapPrompt(
        'Find `Audit Kubernetes cluster security and RBAC policies`, then suggest the best person to assign it to.',
      ),
    ).toMatchObject({
      intent: 'TASK_ASSIGNMENT',
      destination: 'AGENT_CHAT',
    });
  });

  it.each([
    'Find open Kubernetes tasks.',
    'Search for the RBAC audit ticket.',
  ])('routes task search to staffing: %s', (prompt) => {
    expect(classifyTrainingRoadmapPrompt(prompt)).toMatchObject({
      intent: 'TASK_SEARCH',
      destination: 'AGENT_CHAT',
    });
  });

  it.each([
    'Create one Q3/2026 Security Testing initiative for Software Engineer.',
    'Hãy tạo lộ trình đào tạo Kubernetes cho team DevOps.',
    'React testing in Q3',
    '',
  ])('keeps roadmap constraints in the data-first controller: %s', (prompt) => {
    expect(classifyTrainingRoadmapPrompt(prompt)).toMatchObject({
      intent: 'TRAINING_ROADMAP',
      destination: 'TRAINING_ROADMAP',
    });
  });

  it.each([
    'Who is the best engineer with Kubernetes skills?',
    'Tìm người có kỹ năng RBAC.',
  ])('routes people search to staffing: %s', (prompt) => {
    expect(classifyTrainingRoadmapPrompt(prompt)).toMatchObject({
      intent: 'PEOPLE_SEARCH',
      destination: 'AGENT_CHAT',
    });
  });

  it('routes a general question instead of inventing a roadmap', () => {
    expect(classifyTrainingRoadmapPrompt('How does Kubernetes RBAC work?')).toMatchObject({
      intent: 'GENERAL_ASSISTANT',
      destination: 'AGENT_CHAT',
    });
  });
});
