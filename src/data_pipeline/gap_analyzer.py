"""Step 3 — Skill gap analysis (deterministic, with SEPARATED evidence sources).

[FIX-Canh-2] The detection rule is explicit (here and in code), not an LLM guess
and not fuzzy matching.

[FIX #1 — DO NOT MERGE EVIDENCE SOURCES IMPLICITLY]
Two gap signals have different provenance and quality; we keep them in separate
fields so "where did this skill come from?" is answered by the data, not by talk:

  * declared_gap  : taken straight from the DS01 Skill_Gap column (HR/manager human
                    judgment). Reported as-is, NOT filtered by org demand.
  * computed_gap  : org demand (DS02 projects UNION DS05 BOD goals) MINUS the
                    employee's current_skills — a pure set difference.
  * confirmed_gap : declared_gap INTERSECT computed_gap — both human and org agree;
                    highest confidence.
  * target_skills : the ACTIONABLE training list = demanded AND signalled AND lacking,
                    where signalled = declared (DS01 Skill_Gap) UNION survey request
                    (DS03 latest wave). This is what the prioritizer consumes.

Why target_skills, not the naive computed_gap, drives prioritization
-------------------------------------------------------------------
Projects/BOD are not assigned to individuals, so computed_gap alone marks almost
every one of the 205 employees as missing ~70 skills (meaningless trainee pools).
We therefore size cohorts from employees who personally SIGNALLED a need. Skills
demanded but signalled by nobody are still scored by the prioritizer, but surface
with an empty trainee pool (a hiring/sourcing flag, not a training task).

    target skill X for employee E  <=>
        X in org_demand  AND  X not in E.current_skills  AND  X in E.signalled
    Exact match after normalization. No fuzzy match, no LLM.
"""

from __future__ import annotations

from .skill_taxonomy import extract_skills_from_text


def _demand_index(
    normalized_data: dict,
) -> tuple[set[str], dict[str, list[str]], dict[str, list[str]]]:
    """Build org demand set and reverse indexes skill -> [project_ids] / [goal_ids]."""
    skill_to_projects: dict[str, list[str]] = {}
    skill_to_goals: dict[str, list[str]] = {}
    for proj in normalized_data.get("projects", []):
        for skill in proj["required_skills"]:
            skill_to_projects.setdefault(skill, []).append(proj["project_id"])
    for goal in normalized_data.get("goals", []):
        for skill in goal["required_skills"]:
            skill_to_goals.setdefault(skill, []).append(goal["goal_id"])
    demanded = set(skill_to_projects) | set(skill_to_goals)
    return demanded, skill_to_projects, skill_to_goals


def _declared_set(emp: dict) -> set[str]:
    """Human-stated gaps from DS01 Skill_Gap (tokenized + free-text extraction)."""
    return set(emp.get("self_reported_gaps", [])) | set(
        extract_skills_from_text(emp.get("_raw_skill_gap", ""))
    )


def _survey_requests_by_emp(normalized_data: dict) -> dict[str, set[str]]:
    """employee_id -> skills requested in their LATEST survey wave (already resolved)."""
    out: dict[str, set[str]] = {}
    for s in normalized_data.get("surveys", []):
        out.setdefault(s["employee_id"], set()).update(s["requested_skills"])
    return out


def analyze_skill_gaps(normalized_data: dict) -> list[dict]:
    """Per-employee gap with separated declared/computed/confirmed/target fields."""
    demanded, skill_to_projects, skill_to_goals = _demand_index(normalized_data)
    survey_req = _survey_requests_by_emp(normalized_data)

    results: list[dict] = []
    for emp in normalized_data.get("employees", []):
        current = set(emp["current_skills"])
        declared = _declared_set(emp)
        requested = survey_req.get(emp["employee_id"], set())
        signalled = declared | requested

        declared_gap = sorted(declared)
        computed_gap = sorted(demanded - current)
        confirmed_gap = sorted(declared & (demanded - current))
        target_skills = sorted((demanded & signalled) - current)

        gap_sources: dict[str, dict] = {}
        projects_affected: set[str] = set()
        goals_affected: set[str] = set()
        for skill in target_skills:
            projs = skill_to_projects.get(skill, [])
            goals = skill_to_goals.get(skill, [])
            gap_sources[skill] = {
                "projects": projs,
                "bod_goals": goals,
                "in_declared": skill in declared,  # provenance, no implicit merge
                "in_survey": skill in requested,
            }
            projects_affected.update(projs)
            goals_affected.update(goals)

        results.append(
            {
                "employee_id": emp["employee_id"],
                "position": emp["position"],
                "proficiency_level": emp["proficiency_level"],
                "current_skills": emp["current_skills"],
                "declared_gap": declared_gap,
                "computed_gap": computed_gap,
                "confirmed_gap": confirmed_gap,
                "target_skills": target_skills,
                "gap_sources": gap_sources,
                "projects_affected": sorted(projects_affected),
                "bod_goals_affected": sorted(goals_affected),
                "has_target_gap": bool(target_skills),
            }
        )
    return results


def get_critical_gaps(gaps: list[dict]) -> list[dict]:
    """Employees with an actionable (target) gap, sorted by target count descending."""
    return sorted((g for g in gaps if g["has_target_gap"]), key=lambda g: -len(g["target_skills"]))


def get_skills_demand_summary(gaps: list[dict]) -> dict[str, dict]:
    """skill -> {needed_by_count, employees, projects, bod_goals}, sorted by count desc.

    `needed_by_count` = employees who SIGNALLED and lack the skill (the trainee pool),
    drawn from each employee's target_skills.
    """
    summary: dict[str, dict] = {}
    for emp in gaps:
        for skill in emp["target_skills"]:
            entry = summary.setdefault(
                skill,
                {"needed_by_count": 0, "employees": [], "projects": set(), "bod_goals": set()},
            )
            entry["needed_by_count"] += 1
            entry["employees"].append(emp["employee_id"])
            src = emp["gap_sources"][skill]
            entry["projects"].update(src["projects"])
            entry["bod_goals"].update(src["bod_goals"])

    ordered = sorted(summary.items(), key=lambda kv: (-kv[1]["needed_by_count"], kv[0]))
    return {
        skill: {
            "needed_by_count": info["needed_by_count"],
            "employees": info["employees"],
            "projects": sorted(info["projects"]),
            "bod_goals": sorted(info["bod_goals"]),
        }
        for skill, info in ordered
    }
