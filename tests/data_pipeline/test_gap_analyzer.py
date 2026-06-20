"""Unit tests for gap_analyzer — the signal-bounded gap rule on small fixtures."""

import pytest

from src.data_pipeline.gap_analyzer import (
    analyze_skill_gaps,
    get_critical_gaps,
    get_skills_demand_summary,
)


@pytest.fixture
def small_data():
    """EMP_A signals Kubernetes (survey) & has Python; EMP_B has Kubernetes, signals nothing.

    Demand: PRJ_X needs Python+Kubernetes; BOD_X needs Kubernetes.
    """
    return {
        "employees": [
            {
                "employee_id": "EMP_A",
                "position": "Dev",
                "proficiency_level": "Intermediate",
                "current_skills": ["Python"],
                "self_reported_gaps": [],
                "_raw_skill_gap": "",
            },
            {
                "employee_id": "EMP_B",
                "position": "Dev",
                "proficiency_level": "Senior",
                "current_skills": ["Kubernetes"],
                "self_reported_gaps": [],
                "_raw_skill_gap": "",
            },
        ],
        "projects": [{"project_id": "PRJ_X", "required_skills": ["Python", "Kubernetes"]}],
        "goals": [{"goal_id": "BOD_X", "required_skills": ["Kubernetes"]}],
        "surveys": [
            {"employee_id": "EMP_A", "requested_skills": ["Kubernetes"], "priority": "High"}
        ],
    }


def test_signalled_gap_detected(small_data):
    gaps = analyze_skill_gaps(small_data)
    emp_a = next(g for g in gaps if g["employee_id"] == "EMP_A")
    # A lacks Kubernetes, is demanded, and A signalled it -> actionable target
    assert "Kubernetes" in emp_a["target_skills"]


def test_computed_and_target_are_separate_fields(small_data):
    # [FIX #1] B lacks Python (demanded) but never signalled it:
    #   - it IS in computed_gap (pure set diff)  -> transparency
    #   - it is NOT in target_skills (no signal)  -> bounded cohort
    gaps = analyze_skill_gaps(small_data)
    emp_b = next(g for g in gaps if g["employee_id"] == "EMP_B")
    assert "Python" in emp_b["computed_gap"]
    assert emp_b["target_skills"] == []
    assert emp_b["has_target_gap"] is False


def test_no_false_positive_for_owned_skill(small_data):
    gaps = analyze_skill_gaps(small_data)
    emp_b = next(g for g in gaps if g["employee_id"] == "EMP_B")
    # B already has Kubernetes -> never a gap in any field regardless of signal
    assert "Kubernetes" not in emp_b["target_skills"]
    assert "Kubernetes" not in emp_b["computed_gap"]


def test_gap_source_traces_project_and_bod(small_data):
    gaps = analyze_skill_gaps(small_data)
    emp_a = next(g for g in gaps if g["employee_id"] == "EMP_A")
    src = emp_a["gap_sources"]["Kubernetes"]
    assert src["projects"] == ["PRJ_X"]
    assert src["bod_goals"] == ["BOD_X"]
    # provenance kept explicit, not merged into one opaque label
    assert src["in_survey"] is True
    assert src["in_declared"] is False


def test_all_employees_present(small_data):
    gaps = analyze_skill_gaps(small_data)
    assert {g["employee_id"] for g in gaps} == {"EMP_A", "EMP_B"}


def test_demand_summary_counts_only_signalled(small_data):
    gaps = analyze_skill_gaps(small_data)
    summary = get_skills_demand_summary(gaps)
    # only EMP_A signalled Kubernetes -> count 1, not 2
    assert summary["Kubernetes"]["needed_by_count"] == 1
    assert summary["Kubernetes"]["employees"] == ["EMP_A"]


def test_self_reported_gap_is_a_signal():
    data = {
        "employees": [
            {
                "employee_id": "E1",
                "position": "Dev",
                "proficiency_level": "Junior",
                "current_skills": ["Java"],
                "self_reported_gaps": ["Docker"],
                "_raw_skill_gap": "Containerization",
            }
        ],
        "projects": [{"project_id": "P1", "required_skills": ["Docker"]}],
        "goals": [],
        "surveys": [],
    }
    gaps = analyze_skill_gaps(data)
    assert gaps[0]["target_skills"] == ["Docker"]
    assert gaps[0]["confirmed_gap"] == ["Docker"]  # declared AND computed agree
    src = gaps[0]["gap_sources"]["Docker"]
    assert src["in_declared"] is True and src["in_survey"] is False
