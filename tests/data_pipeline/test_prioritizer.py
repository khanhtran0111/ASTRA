"""Unit tests for prioritizer — formula, tiers, tie-breaking, BOD>Project>Personal."""

from datetime import date

import pytest

from src.data_pipeline.prioritizer import get_priority_summary, score_skill_priorities

TODAY = date(2026, 6, 18)


def _data(projects, goals, surveys, employees=None):
    return {
        "employees": employees or [],
        "projects": projects,
        "goals": goals,
        "surveys": surveys,
    }


def _gaps_for(skill, employees):
    """Minimal gap_results so the demand summary reports a trainee pool for `skill`."""
    return [
        {
            "employee_id": e,
            "target_skills": [skill],
            "gap_sources": {skill: {"projects": [], "bod_goals": []}},
        }
        for e in employees
    ]


def test_bod_outranks_project_only():
    data = _data(
        projects=[
            {"project_id": "P1", "required_skills": ["SkillProj"], "deadline": None},
            {"project_id": "P2", "required_skills": ["SkillBod"], "deadline": None},
        ],
        goals=[
            {
                "goal_id": "G1",
                "required_skills": ["SkillBod"],
                "target_deadline": None,
                "strategic_weight": 5,
            }
        ],
        surveys=[],
    )
    scored = score_skill_priorities([], data, today=TODAY)
    by = {s["skill"]: s for s in scored}
    assert by["SkillProj"]["total_score"] == 30  # project only
    assert by["SkillBod"]["total_score"] >= 80  # bod(50)+project(30)+weight
    assert scored[0]["skill"] == "SkillBod"


def test_personal_only_not_an_initiative():
    # A skill requested in a survey but NOT demanded by project/BOD is not scored.
    data = _data(
        projects=[{"project_id": "P1", "required_skills": ["Kubernetes"], "deadline": None}],
        goals=[],
        surveys=[{"employee_id": "E1", "requested_skills": ["English"], "priority": "High"}],
    )
    scored = score_skill_priorities([], data, today=TODAY)
    assert "English" not in {s["skill"] for s in scored}
    assert "Kubernetes" in {s["skill"] for s in scored}


def test_tier_thresholds():
    # bod(50)+project(30) = 80 -> P1 ; project-only 30 -> P3
    data = _data(
        projects=[
            {"project_id": "P1", "required_skills": ["A", "B"], "deadline": None},
        ],
        goals=[{"goal_id": "G1", "required_skills": ["A"], "target_deadline": None, "strategic_weight": 0}],
        surveys=[],
    )
    by = {s["skill"]: s for s in score_skill_priorities([], data, today=TODAY)}
    assert by["A"]["priority_tier"] == "P1"
    assert by["B"]["priority_tier"] == "P3"


def test_urgency_bonus_applied():
    soon = date(2026, 8, 1).isoformat()  # ~44 days from TODAY
    data = _data(
        projects=[{"project_id": "P1", "required_skills": ["X"], "deadline": soon}],
        goals=[],
        surveys=[],
    )
    item = score_skill_priorities([], data, today=TODAY)[0]
    assert item["score_breakdown"]["urgency_bonus"] == 10


def test_past_deadline_not_urgent():
    past = date(2025, 1, 1).isoformat()
    data = _data(
        projects=[{"project_id": "P1", "required_skills": ["X"], "deadline": past}],
        goals=[],
        surveys=[],
    )
    item = score_skill_priorities([], data, today=TODAY)[0]
    assert item["score_breakdown"]["urgency_bonus"] == 0


def test_survey_uses_max_priority():
    data = _data(
        projects=[{"project_id": "P1", "required_skills": ["X"], "deadline": None}],
        goals=[],
        surveys=[
            {"employee_id": "E1", "requested_skills": ["X"], "priority": "Low"},
            {"employee_id": "E2", "requested_skills": ["X"], "priority": "High"},
        ],
    )
    item = score_skill_priorities([], data, today=TODAY)[0]
    assert item["score_breakdown"]["survey_score"] == 10  # max(Low=2, High=10)


def test_sorted_and_breakdown_sums_to_total():
    data = _data(
        projects=[
            {"project_id": "P1", "required_skills": ["A", "B", "C"], "deadline": None},
        ],
        goals=[{"goal_id": "G1", "required_skills": ["A"], "target_deadline": None, "strategic_weight": 7}],
        surveys=[],
    )
    scored = score_skill_priorities([], data, today=TODAY)
    scores = [s["total_score"] for s in scored]
    assert scores == sorted(scores, reverse=True)
    for s in scored:
        assert sum(s["score_breakdown"].values()) == s["total_score"]


def test_warning_when_p1_has_no_trainee():
    # [FIX #6] BOD strongly demands a skill nobody signalled -> P1 but empty pool.
    data = _data(
        projects=[{"project_id": "P1", "required_skills": ["Vault"], "deadline": None}],
        goals=[
            {
                "goal_id": "G1",
                "required_skills": ["Vault"],
                "target_deadline": None,
                "strategic_weight": 9,
            }
        ],
        surveys=[],
    )
    item = score_skill_priorities([], data, today=TODAY)[0]
    assert item["priority_tier"] in ("P1", "P2")
    assert item["target_employee_count"] == 0
    assert "warning" in item and "sourcing" in item["warning"].lower()


def test_no_warning_when_trainees_exist():
    data = _data(
        projects=[{"project_id": "P1", "required_skills": ["X"], "deadline": None}],
        goals=[{"goal_id": "G1", "required_skills": ["X"], "target_deadline": None, "strategic_weight": 9}],
        surveys=[],
    )
    item = score_skill_priorities(_gaps_for("X", ["a", "b"]), data, today=TODAY)[0]
    assert "warning" not in item


def test_tie_break_by_trainee_count():
    # Two skills, identical score, different trainee pool size -> bigger pool first.
    data = _data(
        projects=[
            {"project_id": "P1", "required_skills": ["E", "F"], "deadline": None},
        ],
        goals=[],
        surveys=[],
    )
    gaps = _gaps_for("E", ["a", "b", "c"]) + _gaps_for("F", ["a"])
    scored = score_skill_priorities(gaps, data, today=TODAY)
    order = [s["skill"] for s in scored]
    assert order.index("E") < order.index("F")
