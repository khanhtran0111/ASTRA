"""Step 4 — Priority scoring (deterministic formula + explicit tie-breaking).

[FIX-Canh-3] The scoring formula and tie-break rule are HARDCODED and surfaced in
`score_breakdown`, so any "why is this P1?" question is answered by pointing at the
numbers — no LLM, no hidden weighting.

Scoring (per canonical skill, scored over ORG DEMAND = projects + BOD goals):

    total = bod_alignment + project_alignment + urgency_bonus
            + survey_score + bod_strategic_weight_bonus

    bod_alignment              = 50  if skill required by any BOD goal
    project_alignment          = 30  if skill required by any project
    urgency_bonus              = 10  if a supporting project/BOD deadline is in the
                                     future and <= 90 days from the run date
    survey_score               = max DS03 priority among employees requesting it
                                 (High=10, Medium=5, Low=2; 0 if none) -> BOD>Project>Personal
    bod_strategic_weight_bonus = max strategic_weight of BOD goals containing the
                                 skill (0-10; derived in the normalizer)

    Tier:  P1 >= 70 | P2 40-69 | P3 < 40
    (total can exceed 100 when every component fires; thresholds are on `total`.)

Tie-break (stable, applied in order):
    1. total_score            descending
    2. target_employee_count  descending   (bigger trainee pool first)
    3. len(supporting_projects) descending
    4. skill name             ascending (A->Z)
"""

from __future__ import annotations

from datetime import date

from .gap_analyzer import _demand_index, get_skills_demand_summary

_PRIORITY_VALUE = {"High": 10, "Medium": 5, "Low": 2}


def _survey_scores(normalized_data: dict) -> dict[str, int]:
    """skill -> max DS03 survey priority value among employees requesting it."""
    scores: dict[str, int] = {}
    for s in normalized_data.get("surveys", []):
        val = _PRIORITY_VALUE.get(s["priority"], 0)
        for skill in s["requested_skills"]:
            if val > scores.get(skill, 0):
                scores[skill] = val
    return scores


def _tier(total: int) -> str:
    if total >= 70:
        return "P1"
    if total >= 40:
        return "P2"
    return "P3"


def score_skill_priorities(
    gap_results: list[dict], normalized_data: dict, today: date | None = None
) -> list[dict]:
    """Score and rank every demanded skill. See module docstring for the formula."""
    if today is None:
        today = date.today()

    demanded, skill_to_projects, skill_to_goals = _demand_index(normalized_data)
    demand_summary = get_skills_demand_summary(gap_results)
    survey_scores = _survey_scores(normalized_data)

    proj_deadline = {p["project_id"]: p["deadline"] for p in normalized_data.get("projects", [])}
    goal_deadline = {g["goal_id"]: g["target_deadline"] for g in normalized_data.get("goals", [])}
    goal_weight = {g["goal_id"]: g["strategic_weight"] for g in normalized_data.get("goals", [])}

    # [F-02] which internal trainers can teach each skill (exact canonical match)
    trainers_for: dict[str, list[str]] = {}
    for t in normalized_data.get("trainers", []):
        for sk in t["skills"]:
            trainers_for.setdefault(sk, []).append(t["trainer_id"])

    # [F-04 link] how many employees CURRENTLY HAVE each skill (supply). Same count
    # as insights_report F-04, surfaced on the initiative so the two files agree.
    holder_count: dict[str, int] = {}
    for e in normalized_data.get("employees", []):
        for sk in e["current_skills"]:
            holder_count[sk] = holder_count.get(sk, 0) + 1

    def is_urgent(project_ids: list[str], goal_ids: list[str]) -> tuple[bool, str | None]:
        """True if any supporting deadline is in the future and <= 90 days away."""
        nearest: date | None = None
        for iso in [proj_deadline.get(p) for p in project_ids] + [
            goal_deadline.get(g) for g in goal_ids
        ]:
            if not iso:
                continue
            d = date.fromisoformat(iso)
            delta = (d - today).days
            if 0 <= delta <= 90 and (nearest is None or d < nearest):
                nearest = d
        return (nearest is not None, nearest.isoformat() if nearest else None)

    scored: list[dict] = []
    for skill in demanded:
        projects = sorted(skill_to_projects.get(skill, []))
        goals = sorted(skill_to_goals.get(skill, []))

        bod_alignment = 50 if goals else 0
        project_alignment = 30 if projects else 0
        urgent, urgent_date = is_urgent(projects, goals)
        urgency_bonus = 10 if urgent else 0
        survey_score = survey_scores.get(skill, 0)
        weight_bonus = max((goal_weight.get(g, 0) for g in goals), default=0)

        breakdown = {
            "bod_alignment": bod_alignment,
            "project_alignment": project_alignment,
            "urgency_bonus": urgency_bonus,
            "survey_score": survey_score,
            "bod_strategic_weight_bonus": weight_bonus,
        }
        total = sum(breakdown.values())

        info = demand_summary.get(skill, {"needed_by_count": 0, "employees": []})
        target_employees = info["employees"]
        target_count = info["needed_by_count"]

        # deterministic evidence string (no LLM)
        parts: list[str] = []
        if goals:
            wg = max(goals, key=lambda g: goal_weight.get(g, 0))
            parts.append(f"{wg} (weight={goal_weight.get(wg, 0)})")
        if projects:
            parts.append(f"projects {', '.join(projects[:3])}")
        if urgent_date:
            parts.append(f"deadline {urgent_date} (urgent<=90d)")
        if survey_score:
            parts.append(f"survey signal (score {survey_score})")
        parts.append(
            f"{target_count} trainee(s)" if target_count else "no internal trainee pool"
        )
        evidence = "; ".join(parts) + "."

        tier = _tier(total)
        internal_trainers = sorted(trainers_for.get(skill, []))
        item = {
            "skill": skill,
            "priority_tier": tier,
            "total_score": total,
            "score_breakdown": breakdown,
            "target_employees": target_employees,
            "target_employee_count": target_count,
            "supporting_projects": projects,
            "supporting_bod_goals": goals,
            "internal_trainer_available": bool(internal_trainers),  # [F-02] see insights F-02
            "internal_trainers": internal_trainers,                 # [F-02]
            "current_holder_count": holder_count.get(skill, 0),     # [F-04] see insights F-04
            "evidence_summary": evidence,
        }
        # [FIX #6] high-priority skill that nobody signalled -> sourcing flag, so
        # Agent 1 does not hunt for a trainee pool that does not exist.
        if tier in ("P1", "P2") and target_count == 0:
            item["warning"] = (
                "High-priority demand with zero internal trainee signal — likely a "
                "hiring / external-sourcing gap, not an internal training task."
            )
        # [F-02] demanded by trainees but NO internal trainer covers it -> capacity gap.
        if target_count > 0 and not internal_trainers:
            item["trainer_gap"] = (
                f"{target_count} trainee(s) need this but NO internal trainer covers "
                f"it — schedule external trainer / online course."
            )
        scored.append(item)

    scored.sort(
        key=lambda it: (
            -it["total_score"],
            -it["target_employee_count"],
            -len(it["supporting_projects"]),
            it["skill"],
        )
    )
    return scored


def get_priority_summary(scored: list[dict]) -> dict[str, list[str]]:
    """{'P1': [skill,...], 'P2': [...], 'P3': [...]} preserving sorted order."""
    out: dict[str, list[str]] = {"P1": [], "P2": [], "P3": []}
    for item in scored:
        out[item["priority_tier"]].append(item["skill"])
    return out
