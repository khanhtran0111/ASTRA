# Human-in-the-Loop (HITL) Feedback Tasks

## Objective

Enable human reviewers to provide feedback on the generated training roadmap and allow the system to regenerate the roadmap using:

1. The original user prompt.
2. The previous roadmap result.
3. The human review feedback.

The workflow should support iterative refinement before final approval.

---

# Functional Requirements

## 1. Feedback Input UI

### Requirements

- Add a feedback text area in the Human Review screen.
- The reviewer can enter comments, suggestions, or requested changes.
- Feedback should be optional for approval and required for revision requests.

### Example Feedback

```text
Increase Kubernetes training priority because Project PRJ-009 starts next month.

Replace external CI/CD training with an internal trainer if possible.

Split the System Design course into Beginner and Advanced tracks.
```

---

## 2. New Review Actions

The Human Review step should support three actions:

### Approve

- Mark roadmap as approved.
- Generate approval token.

### Reject

- Mark roadmap as rejected.
- Store reviewer comments.

### Request Revision

- Save feedback.
- Trigger roadmap regeneration.

---

# Backend Tasks

## 3. Feedback API Endpoint

### New Endpoint

```http
POST /api/training-roadmap/feedback
```

### Request

```json
{
  "runId": "abc123",
  "feedback": "Increase Kubernetes priority."
}
```

### Response

```json
{
  "runId": "abc123",
  "reviewStatus": "pending_review",
  "qaDecision": "PASS_WITH_WARNINGS",
  "initiatives": []
}
```

The response is the complete, newly generated and QA-reviewed `RoadmapResult`; the client does not call `/qa` again.

---

## 4. Persist Human Feedback

Create storage for:

```ts
type HumanFeedback = {
  runId: string;
  feedback: string;
  createdAt: string;
  reviewerId?: string;
};
```

The feedback should be attached to the roadmap run so it can be reused during regeneration.

---

## 5. Regeneration Pipeline

When feedback is submitted:

1. Load original input dataset.
2. Load original prompt.
3. Load previous roadmap result.
4. Load human feedback.
5. Re-run the deterministic data-first coordinator.
6. Persist the canonical Agent 1 artifact under the same `runId`.
7. Re-run QA and the bounded deterministic revision loop.
8. Persist and return the new final roadmap version.

---

## 6. Agent Prompt Updates

### Agent 1 Input

```text
Original Prompt
+
Previous Roadmap
+
Human Feedback
```

### Example Prompt

```text
The previous roadmap received the following reviewer feedback:

- Increase Kubernetes priority.
- Prefer internal trainers for CI/CD.

Regenerate the roadmap while preserving valid initiatives and applying the requested changes when possible.
```

---

## 7. Version Management

Every regeneration should create a new roadmap version.

Example:

```text
run-001-v1
run-001-v2
run-001-v3
```

Store:

```ts
type RoadmapVersion = {
  runId: string;
  version: number;
  feedback?: string;
  roadmap: RoadmapResult;
  createdAt: string;
};
```

---

## 8. Execution Log Updates

Append new log entries:

```text
Human feedback received.
Roadmap regeneration started.
Agent 1 completed.
Agent 2 completed.
QA validation completed.
Human review required again.
```

---

# Frontend Tasks

## 9. Feedback Form

Add:

- Text area
- Submit Revision button
- Loading state
- Error state

---

## 10. Version History UI

Display:

- Version number
- Timestamp
- Reviewer feedback
- Previous roadmap snapshots

Example:

```text
Version 1 - Initial generation
Version 2 - Increased Kubernetes priority
Version 3 - Internal trainer reassignment
```

---

## 11. Regeneration Status

Show status badges:

```text
Pending Review
Reprocessing
Approved
Rejected
```

---

# QA Tasks

## 12. Validation Tests

### Test Cases

#### Submit Feedback

- feedback saved successfully.

#### Regeneration

- new roadmap version created.

#### Prompt Injection

- feedback is included in Agent 1 input.

#### Version History

- previous versions remain accessible.

#### Approval Flow

- approval only applies to latest version.

---

# Expected Workflow

```text
Generate Roadmap
        ↓
Human Review
        ↓
   Feedback Submitted
        ↓
Store Feedback
        ↓
Regenerate Roadmap
        ↓
Run QA
        ↓
New Version Created
        ↓
Human Review Again
        ↓
Approve / Reject
```
