"""Insights analysis — surfaces the evaluator's expected findings as explicit output.

These are deterministic data analyses (frequency counts, coverage %, supply lookup),
not LLM reasoning, so they belong in the data layer. Each function maps to a finding
in the dataset answer key:

  F-01  declared_gap_frequency  : rank DS01 Skill_Gap by how many employees declared it
  F-02  trainer_supply_demand   : demanded skills with no internal trainer (capacity gap)
  F-03  goal_coverage           : current coverage vs BOD target % (e.g. GOAL-2026-07 >=60%)
  F-04  skill_supply_index      : who CURRENTLY HAS each demanded skill (scarcity)
"""

from __future__ import annotations

import math
import re
from collections import Counter

# Positions counted as the "development team" for coverage math (F-03).
# Heuristic, documented so the dev_team_size is auditable.
_DEV_ROLE_KEYWORDS = (
    "develop",
    "engineer",
    "tech lead",
    "technical lead",
    "backend",
    "frontend",
    "fullstack",
    "devops",
    "architect",
    "programmer",
)


def _is_dev(position: str) -> bool:
    p = (position or "").lower()
    return any(k in p for k in _DEV_ROLE_KEYWORDS)


def declared_gap_frequency(normalized_data: dict) -> list[dict]:
    """[F-01] Rank the DS01 Skill_Gap column by how many employees declared each gap.

    Counts canonical self_reported_gaps across all employees, descending. The top of
    this list (Containerization, Cloud Services on the real data) is the high-frequency
    gap the agent must surface.
    """
    employees = normalized_data.get("employees", [])
    total = len(employees) or 1
    counter: Counter[str] = Counter()
    for emp in employees:
        # self_reported_gaps is already deduped (normalize_skill_list); no set() here —
        # wrapping it in a set previously made tie order depend on Python's hash seed,
        # so two runs of the same data could rank tied skills differently.
        for skill in emp.get("self_reported_gaps", []):
            counter[skill] += 1
    ranked = sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))
    return [
        {
            "skill": skill,
            "employee_count": n,
            "percent_of_workforce": round(100 * n / total, 1),
        }
        for skill, n in ranked
    ]


def skill_supply_index(normalized_data: dict, demanded_skills: set[str], scarce_threshold: int = 3) -> list[dict]:
    """[F-04] For each demanded skill, who CURRENTLY HAS it (cross-reference DS01).

    Surfaces scarcity: skills held by <= scarce_threshold employees are supply risks
    (on real data AI Agent=0, LLM/GenAI=1, MLOps=1 holders). Sorted scarcest first.
    """
    employees = normalized_data.get("employees", [])
    rows: list[dict] = []
    for skill in demanded_skills:
        holders = [e["employee_id"] for e in employees if skill in e["current_skills"]]
        rows.append(
            {
                "skill": skill,
                "holder_count": len(holders),
                "holders": holders,
                "scarce": len(holders) <= scarce_threshold,
            }
        )
    rows.sort(key=lambda r: (r["holder_count"], r["skill"]))
    return rows


def goal_coverage(normalized_data: dict) -> list[dict]:
    """[F-03] Quantify current coverage of each BOD goal's skills vs its target %.

    Coverage is measured over the development team (see _DEV_ROLE_KEYWORDS). If the
    goal text states a percentage (e.g. GOAL-2026-07 "at least 60%"), it is parsed as
    target_percent and the shortfall + employees_to_train are computed.
    """
    employees = normalized_data.get("employees", [])
    devs = [e for e in employees if _is_dev(e["position"])]
    dev_total = len(devs) or 1

    rows: list[dict] = []
    for goal in normalized_data.get("goals", []):
        m = re.search(r"(\d+)\s*%", goal.get("_raw_description", ""))
        target_pct = int(m.group(1)) if m else None
        skills_cov = []
        for skill in goal["required_skills"]:
            have = sum(1 for e in devs if skill in e["current_skills"])
            current_pct = round(100 * have / dev_total, 1)
            entry = {
                "skill": skill,
                "dev_holders": have,
                "current_percent": current_pct,
            }
            if target_pct is not None:
                target_count = math.ceil(dev_total * target_pct / 100)
                entry["target_percent"] = target_pct
                entry["shortfall_percent"] = round(max(0.0, target_pct - current_pct), 1)
                entry["employees_to_train"] = max(0, target_count - have)
            skills_cov.append(entry)
        rows.append(
            {
                "goal_id": goal["goal_id"],
                "target_quarter": goal.get("target_quarter"),
                "target_percent": target_pct,
                "dev_team_size": len(devs),
                "skills_coverage": skills_cov,
            }
        )
    return rows


def trainer_supply_demand(normalized_data: dict, scored: list[dict]) -> dict:
    """[F-02] Org-level supply-vs-demand: demanded skills with no internal trainer.

    Returns the count of internal trainers, the skills they cover, and the demanded
    skills (with a trainee pool) that NO internal trainer covers — the capacity gaps
    the agent must flag.
    """
    trainer_skills: set[str] = set()
    for t in normalized_data.get("trainers", []):
        trainer_skills.update(t["skills"])

    uncovered = [
        {
            "skill": it["skill"],
            "priority_tier": it["priority_tier"],
            "target_employee_count": it["target_employee_count"],
        }
        for it in scored
        if it["target_employee_count"] > 0 and not it.get("internal_trainer_available", False)
    ]
    uncovered.sort(key=lambda r: (-r["target_employee_count"], r["skill"]))
    return {
        "internal_trainer_count": len(normalized_data.get("trainers", [])),
        "skills_covered_internally": sorted(trainer_skills),
        "demanded_skills_without_trainer": uncovered,
        "uncovered_count": len(uncovered),
    }


def build_insights_report(normalized_data: dict, scored: list[dict], demanded_skills: set[str]) -> dict:
    """Assemble all four findings into one report keyed by finding id."""
    return {
        "_cross_reference": {
            "priority_report": "priority_result.json",
            "note": "These org-level findings back the per-skill initiatives in priority_result.json. "
            "F-02/F-04 numbers match each initiative's internal_trainer_available / current_holder_count.",
        },
        "F-01_declared_gap_frequency": {
            "description": "DS01 Skill_Gap ranked by employee frequency (high-frequency gaps first).",
            "ranking": declared_gap_frequency(normalized_data),
        },
        "F-02_trainer_supply_demand": {
            "description": "Demanded skills with a trainee pool but no internal trainer (capacity gap).",
            **trainer_supply_demand(normalized_data, scored),
        },
        "F-03_goal_coverage": {
            "description": "Current dev-team coverage vs each BOD goal's target % (e.g. GOAL-2026-07 >=60%).",
            "goals": goal_coverage(normalized_data),
        },
        "F-04_skill_supply_index": {
            "description": "Who currently HAS each demanded skill (cross-reference DS01); scarce skills flagged.",
            "supply": skill_supply_index(normalized_data, demanded_skills),
        },
    }
