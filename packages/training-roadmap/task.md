# QA Agent (QA-only task)

## Purpose

Phiên bản này thu gọn scope để chỉ thực hiện phần QA (QA Agent) trên đầu vào `roadmap_output_agent.json` do Agent 1 sinh ra.

Mục tiêu: nhận đầu vào mock (priority results + normalized data), chạy chỉ bước QA — so khớp roadmap/initiatives với:

- Mục tiêu BOD (Board of Directors) — BOD alignment
- Yêu cầu của project (required skills, project quarter)
- Mong muốn/constraints của trainee (target skills, availability)
- Timeline / planning horizon (initiative quarter phù hợp với project/trainee constraints)

Agent phải áp dụng các rule hiện có (Invalid Trainee, Trainer Gap, Missing Evidence) và thêm các kiểm tra sau:

- BOD Alignment: initiative phải liên kết với ít nhất một `bodGoal` có `requiredSkills` chứa skill của initiative; nếu không, báo `BOD_ALIGNMENT_RISK` (severity MEDIUM).
- Project Requirement Match: initiative skill phải khớp yêu cầu của ít nhất một supporting project (skill in `project.requiredSkills`); nếu không, báo `MISSING_PROJECT_REQUIREMENT` (severity MEDIUM).
- Trainee Desire / Capacity: mỗi `targetTraineeId` phải có `targetSkills` chứa initiative skill; nếu không, `TRAINEE_MISMATCH` (severity MEDIUM).
- Timeline Fit: initiative `quarter` phải tương thích với any supporting project `quarter` or planningHorizon; nếu không, `TIMELINE_RISK` (severity LOW or MEDIUM depending on mismatch).

Agent đầu ra: danh sách `QaFinding` kèm `evidence` cho từng finding, tổng `score`, `riskLevel`, và tóm tắt `evidencePack`.

---

## Inputs

- `roadmap_output_agent.json` — nguồn roadmap/initiatives chính để QA audit; QA không chạy lại Agent 1.
- `data/processed/normalized_data.json` — dữ liệu đối chiếu employee, trainer, project và BOD goal.
- `priorityResult` được derive từ evidence và metadata có sẵn trong từng initiative của roadmap output.

Input shape expected (JSON):

```json
{
  "runId": "...",
  "reviewStatus": "pending",
  "executionLog": [],
  "initiatives": [
    {
      "id": "CLS-001",
      "topic": "Kubernetes",
      "quarter": "Q3 2026",
      "targetTrainees": ["EMP-100"],
      "format": "EXTERNAL_TRAINER",
      "evidence": ["GOAL-2026-07", "PRJ-002"]
    }
  ]
}
```

---

## Findings (extended)

Each finding must include an `evidence` array describing the data points used to reach the finding.

Finding types (non-exhaustive):

- `INVALID_TRAINEE` — trainee not present in `normalizedData.employees` or not matching target skills.
- `TRAINER_GAP` — internal trainer required but not available or lacks skills/availableHours.
- `MISSING_EVIDENCE` — initiative lacks supporting evidence (no supportingProjects / bodGoals / evidenceSummary).
- `BOD_ALIGNMENT_RISK` — initiative skill not linked to any `bodGoals`' requiredSkills.
- `MISSING_PROJECT_REQUIREMENT` — no supporting project requires the skill.
- `TRAINEE_MISMATCH` — trainee's targetSkills do not include the initiative skill.
- `TIMELINE_RISK` — quarter mismatch between initiative and supporting project/planning horizon.

Finding structure:

```ts
type QaFinding = {
  type: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  message: string;
  skill?: string;
  relatedInitiativeId?: string;
  evidence: Array<{ path: string; value: unknown }>;
};
```

---

## Scoring & Risk

- Start from 100; apply deductions: HIGH -20, MEDIUM -10, LOW -5.
- `riskLevel` computed as before: >=90 LOW, 70-89 MEDIUM, <70 HIGH.

---

## Output

```ts
{
  findings: QaFinding[],
  score: number,
  riskLevel: "LOW" | "MEDIUM" | "HIGH",
  evidencePack: Record<string, unknown>
}
```

`evidencePack` should include references to `priorityResult`, matching `projects` and `bodGoals` used for each finding.

---

## Behavioural Notes for Agent

- Agent must call every registered QA rule tool; pipeline không gọi trực tiếp các rule deterministic.
- Với BOD alignment và project requirement, Agent phải dùng `semanticContext` từ tool để hiểu quan hệ gần nghĩa/thứ bậc năng lực, không chỉ so khớp chuỗi chính xác.
- Agent phải gọi score tool sau cùng; output score/risk phải khớp nguyên văn kết quả tool.
- Pipeline fail nếu Agent bỏ qua bất kỳ required tool nào.
- Agent không được invent IDs hoặc external facts.
- For each finding include clear `evidence` entries (JSON pointer style `path` strings are okay, e.g. `normalizedData.projects[2].requiredSkills`).
- Keep output machine-parseable for downstream automation.

---

## Testing

- Run QA locally by invoking the route or a small script that loads the JSON and calls the QA routine.

---

## Current Scope

Implement only the QA checks described above (no roadmap generation). This file documents the expected behaviour for the QA-only implementation.
