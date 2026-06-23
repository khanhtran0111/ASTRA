import { describe, expect, it } from 'vitest';
import {
  enforcePromptScope,
  parseRoadmapConstraints,
} from '../../src/backend/domain/prompt-constraints.ts';
import { matchesSkill } from '../../src/backend/domain/skill-aliases.ts';

const dockerPrompt =
  'Hãy tạo một training initiative Q3/2026 về Docker & Containerization Foundation cho Software Developer có skill gap Containerization trong DS01. Chỉ chọn tối đa 5 trainees có evidence rõ. Initiative này phục vụ PRJ-005 và GOAL-2026-07. Ưu tiên trainer nội bộ có expertise Docker; nếu không đủ capacity thì đề xuất self-study hoặc blended fallback.';

describe('roadmap prompt constraints', () => {
  it('extracts and enforces the Docker initiative scope', () => {
    const constraints = parseRoadmapConstraints(dockerPrompt);

    expect(constraints).toMatchObject({
      requestedQuarter: 'Q3_2026',
      requestedInitiativeCount: 1,
      targetRoles: ['Software Developer'],
      targetSkillGaps: ['Containerization'],
      maxTrainees: 5,
      requiredProjectIds: ['PRJ-005'],
      requiredGoalIds: ['GOAL-2026-07'],
      trainerPreferenceSkills: ['Docker'],
      allowFallback: true,
    });

    expect(
      enforcePromptScope(
        [
          { topic: 'Docker', quarter: 'Q2 2026' },
          { topic: 'Kubernetes', quarter: 'Q3 2026' },
        ],
        constraints,
      ),
    ).toEqual([{ topic: 'Docker & Containerization Foundation', quarter: 'Q3 2026' }]);
  });

  it('uses cloud-native as an umbrella without treating sibling skills as synonyms', () => {
    expect(matchesSkill('cloud-native technologies', 'Docker')).toBe(true);
    expect(matchesSkill('Docker', 'Containerization')).toBe(true);
    expect(matchesSkill('Kubernetes', 'Docker')).toBe(false);
    expect(matchesSkill('CI/CD', 'Docker')).toBe(false);
  });
});
