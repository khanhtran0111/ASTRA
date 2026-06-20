"""Step 2 — Normalize the real data into a clean, auditable structure.

[FIX-Canh-1] This step is explicit and produces normalized_data.json with `_raw_*`
fields so teammates/judges can audit every skill-name transformation.

What it does with REAL data (beyond the mock guideline):
  - DS01 Skill        -> current_skills (canonical list)
  - DS01 Skill_Gap    -> self_reported_gaps (canonical list)  [used as evidence later]
  - DS02 Required_Skills -> required_skills; Timeline -> start_date/deadline
  - DS03 Training_Topic  -> requested_skills (EXTRACTED from free text)
  - DS03 Survey_ID       -> survey_period (for time-conflict resolution)
  - DS04 Expertise       -> skills; hours kept as int
  - DS05 Goal_Description-> required_skills (EXTRACTED from free text)
  - DS05 Target_Quarter  -> target_deadline; strategic_weight DERIVED (see below)

All deterministic. No LLM, no AI library imports.
"""

from __future__ import annotations

import re
from datetime import date

from .skill_taxonomy import (
    extract_skills_with_evidence,
    normalize_skill_list,
    quarter_to_dates,
)


def _iso(d) -> str | None:
    return d.isoformat() if d is not None else None


_PERIOD_RE = re.compile(r"(\d{4})[_ ]?Q([1-4])", re.IGNORECASE)


def _period_key(period: str) -> tuple[int, int]:
    """'2025_Q4' -> (2025, 4) for chronological comparison; unknown -> (0, 0)."""
    m = _PERIOD_RE.search(period or "")
    return (int(m.group(1)), int(m.group(2))) if m else (0, 0)


def resolve_latest_survey_per_employee(surveys: list[dict]) -> tuple[list[dict], list[dict]]:
    """[FIX #5] Keep only each employee's MOST RECENT survey wave as current signal.

    Real DS03 has two waves (2025_Q4, 2026_Q1). Training preferences change over
    time, so an employee surveyed in both should be represented by their latest
    wave only — this is the deterministic mechanism behind "conflicting surveys
    that change over time", not just a claim.

    Rule: group rows by employee_id, find the max survey_period, keep ALL rows of
    that wave (an employee may list several topics in one wave). Returns
    (kept, superseded) so the older rows remain auditable.
    """
    latest_period: dict[str, tuple[int, int]] = {}
    for s in surveys:
        eid = s["employee_id"]
        key = _period_key(s["survey_period"])
        if eid not in latest_period or key > latest_period[eid]:
            latest_period[eid] = key

    kept: list[dict] = []
    superseded: list[dict] = []
    for s in surveys:
        if _period_key(s["survey_period"]) == latest_period[s["employee_id"]]:
            kept.append(s)
        else:
            superseded.append(s)
    return kept, superseded


def _derive_strategic_weights(goals: list[dict], today: date) -> dict[str, int]:
    """[4.1] Derive a 1-10 strategic_weight per BOD goal.

    The real DS05 has NO strategic_weight column, so we derive one
    deterministically (documented as an assumption in pipeline metadata):
    a goal is most strategically *active* when its target deadline is closest to
    the run date. We rank goals by absolute distance |target_deadline - today|
    and map linearly onto 10 (nearest/active) -> 4 (most distant). This avoids
    over-weighting already-finished past goals AND far-future goals, peaking on
    what the organisation should be acting on now. Unparseable quarters rank last.
    """
    def distance(g: dict) -> tuple[int, int]:
        if g["target_deadline"] is None:
            return (1, 0)  # push to the end
        d = date.fromisoformat(g["target_deadline"])
        return (0, abs((d - today).days))

    ranked = sorted(goals, key=distance)
    n = len(ranked)
    weights: dict[str, int] = {}
    for idx, g in enumerate(ranked):
        weights[g["goal_id"]] = 10 if n == 1 else round(10 - (idx / (n - 1)) * 6)
    return weights


def normalize_dataset(data: dict, today: date | None = None) -> dict:
    """Normalize the loaded raw data. Returns a new dict, same top-level keys.

    `today` anchors the strategic-weight derivation (defaults to date.today());
    the pipeline passes a fixed run date so output is reproducible for the demo.
    """
    if today is None:
        today = date.today()
    out: dict = {"_source_status": data.get("_source_status", {})}

    # --- DS01 employees ---
    out["employees"] = []
    for row in data.get("employees", []):
        out["employees"].append(
            {
                "employee_id": row["Employee_ID"],
                "position": row["Position"],
                "current_skills": normalize_skill_list(row["Skill"]),
                "proficiency_level": row["Proficiency_Level"],
                "self_reported_gaps": normalize_skill_list(row["Skill_Gap"]),
                "_raw_skills": row["Skill"],
                "_raw_skill_gap": row["Skill_Gap"],
            }
        )

    # --- DS02 projects ---
    out["projects"] = []
    for row in data.get("projects", []):
        start, deadline = quarter_to_dates(row["Timeline"])
        out["projects"].append(
            {
                "project_id": row["Project_ID"],
                "required_skills": normalize_skill_list(row["Required_Skills"]),
                "start_date": _iso(start),
                "deadline": _iso(deadline),
                "_raw_timeline": row["Timeline"],
                "_raw_skills": row["Required_Skills"],
            }
        )

    # --- DS03 surveys (free-text topic -> skills) ---
    all_surveys: list[dict] = []
    for row in data.get("surveys", []):
        survey_id = row["Survey_ID"]
        # "SUR_2026_Q1" -> "2026_Q1"
        period = survey_id.replace("SUR_", "") if survey_id.startswith("SUR_") else survey_id
        evidence = extract_skills_with_evidence(row["Training_Topic"])
        all_surveys.append(
            {
                "survey_id": survey_id,
                "employee_id": row["Employee_ID"],
                "requested_skills": [e["skill"] for e in evidence],
                "priority": row["Priority"],
                "survey_period": period,
                "_raw_topic": row["Training_Topic"],
                "_skill_extraction": [  # [FIX #4] which keyword matched, from where
                    {**e, "source_field": "DS03.Training_Topic"} for e in evidence
                ],
            }
        )
    # [FIX #5] only the latest wave per employee is the current signal
    out["surveys"], out["_superseded_surveys"] = resolve_latest_survey_per_employee(all_surveys)

    # --- DS04 trainers ---
    out["trainers"] = []
    for row in data.get("trainers", []):
        try:
            hours = int(float(row["Availability_Hours_Per_Month"]))
        except (ValueError, TypeError):
            hours = 0
        out["trainers"].append(
            {
                "trainer_id": row["Trainer_ID"],
                "skills": normalize_skill_list(row["Expertise"]),
                "available_hours_per_month": hours,
                "_raw_expertise": row["Expertise"],
            }
        )

    # --- DS05 BOD goals (free-text -> skills, derive deadline + weight) ---
    goals: list[dict] = []
    for row in data.get("goals", []):
        _, deadline = quarter_to_dates(row["Target_Quarter"])
        evidence = extract_skills_with_evidence(row["Goal_Description"])
        goals.append(
            {
                "goal_id": row["Goal_ID"],
                "required_skills": [e["skill"] for e in evidence],
                "target_quarter": row["Target_Quarter"],
                "target_deadline": _iso(deadline),
                "_raw_description": row["Goal_Description"],
                "_skill_extraction": [  # [FIX #4] keyword + source for each skill
                    {**e, "source_field": "DS05.Goal_Description"} for e in evidence
                ],
            }
        )
    weights = _derive_strategic_weights(goals, today)
    for g in goals:
        g["strategic_weight"] = weights[g["goal_id"]]
    out["goals"] = goals

    return out
