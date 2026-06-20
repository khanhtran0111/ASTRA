"""Tests for insights — the four answer-key findings F-01..F-04."""

from src.data_pipeline.insights import (
    declared_gap_frequency,
    goal_coverage,
    skill_supply_index,
    trainer_supply_demand,
)


def _emp(eid, position, current, declared):
    return {
        "employee_id": eid,
        "position": position,
        "proficiency_level": "Intermediate",
        "current_skills": current,
        "self_reported_gaps": declared,
        "_raw_skill_gap": "",
    }


def test_f01_declared_gap_ranked_by_frequency():
    data = {
        "employees": [
            _emp("E1", "Dev", [], ["Containerization", "Cloud Services"]),
            _emp("E2", "Dev", [], ["Containerization"]),
            _emp("E3", "Dev", [], ["Cloud Services"]),
            _emp("E4", "Dev", [], ["Containerization"]),
        ]
    }
    ranking = declared_gap_frequency(data)
    assert ranking[0]["skill"] == "Containerization"
    assert ranking[0]["employee_count"] == 3
    assert ranking[1]["skill"] == "Cloud Services"


def test_f02_flags_demand_without_trainer():
    data = {"trainers": [{"trainer_id": "T1", "skills": ["Python"]}]}
    scored = [
        {"skill": "CI/CD", "priority_tier": "P1", "target_employee_count": 15,
         "internal_trainer_available": False},
        {"skill": "Python", "priority_tier": "P2", "target_employee_count": 9,
         "internal_trainer_available": True},
    ]
    out = trainer_supply_demand(data, scored)
    uncovered = [r["skill"] for r in out["demanded_skills_without_trainer"]]
    assert "CI/CD" in uncovered  # no trainer
    assert "Python" not in uncovered  # T1 covers it


def test_f03_coverage_vs_target_percent():
    data = {
        "employees": [
            _emp("E1", "Software Developer", ["Kubernetes"], []),
            _emp("E2", "Backend Developer", [], []),
            _emp("E3", "QA Engineer", [], []),  # 'engineer' counts as dev
            _emp("E4", "Accountant", [], []),  # not dev
        ],
        "goals": [
            {
                "goal_id": "G1",
                "target_quarter": "Q3_2026",
                "required_skills": ["Kubernetes"],
                "_raw_description": "Upskill at least 60% of development team in cloud-native.",
            }
        ],
    }
    rows = goal_coverage(data)
    g = rows[0]
    assert g["dev_team_size"] == 3  # E1,E2,E3 (not the accountant)
    assert g["target_percent"] == 60
    cov = g["skills_coverage"][0]
    assert cov["dev_holders"] == 1  # only E1 has Kubernetes
    # need ceil(3*0.6)=2 holders, have 1 -> train 1 more
    assert cov["employees_to_train"] == 1


def test_priority_holder_count_matches_supply_index():
    """[cross-ref] current_holder_count on initiatives must equal F-04 supply numbers,
    so priority_result.json and insights_report.json never tell different stories."""
    from datetime import date

    from src.data_pipeline.gap_analyzer import _demand_index, analyze_skill_gaps
    from src.data_pipeline.prioritizer import score_skill_priorities

    data = {
        "employees": [
            _emp("E1", "Dev", ["Python", "Kubernetes"], []),
            _emp("E2", "Dev", ["Python"], []),
        ],
        "projects": [{"project_id": "P1", "required_skills": ["Python", "Kubernetes"], "deadline": None}],
        "goals": [],
        "surveys": [],
    }
    gaps = analyze_skill_gaps(data)
    scored = score_skill_priorities(gaps, data, today=date(2026, 6, 18))
    demanded, _, _ = _demand_index(data)
    supply = {r["skill"]: r["holder_count"] for r in skill_supply_index(data, demanded)}
    for it in scored:
        assert it["current_holder_count"] == supply[it["skill"]], it["skill"]


def test_f04_supply_index_flags_scarcity():
    data = {
        "employees": [
            _emp("E1", "Dev", ["Python", "LLM/GenAI"], []),
            _emp("E2", "Dev", ["Python"], []),
            _emp("E3", "Dev", ["Python"], []),
            _emp("E4", "Dev", ["Python"], []),
        ]
    }
    supply = skill_supply_index(data, {"LLM/GenAI", "Python", "AI Agent"}, scarce_threshold=3)
    by = {r["skill"]: r for r in supply}
    assert by["AI Agent"]["holder_count"] == 0 and by["AI Agent"]["scarce"] is True
    assert by["LLM/GenAI"]["holder_count"] == 1 and by["LLM/GenAI"]["scarce"] is True
    assert by["Python"]["holder_count"] == 4 and by["Python"]["scarce"] is False
    # scarcest sorted first
    assert supply[0]["skill"] == "AI Agent"
