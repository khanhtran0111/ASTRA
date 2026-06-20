"""[FIX #5] Tests for resolve_latest_survey_per_employee — the time-conflict mechanism."""

from src.data_pipeline.normalizer import resolve_latest_survey_per_employee


def _s(eid, period, skills, priority="Medium"):
    return {
        "employee_id": eid,
        "survey_period": period,
        "requested_skills": skills,
        "priority": priority,
    }


def test_keeps_only_latest_wave():
    surveys = [
        _s("E1", "2025_Q4", ["System Design"]),
        _s("E1", "2026_Q1", ["Leadership"]),
    ]
    kept, superseded = resolve_latest_survey_per_employee(surveys)
    assert [k["requested_skills"] for k in kept] == [["Leadership"]]
    assert [s["survey_period"] for s in superseded] == ["2025_Q4"]


def test_three_waves_picks_newest():
    surveys = [
        _s("E1", "2024_Q1", ["A"]),
        _s("E1", "2025_Q4", ["B"]),
        _s("E1", "2026_Q1", ["C"]),
    ]
    kept, superseded = resolve_latest_survey_per_employee(surveys)
    assert [k["survey_period"] for k in kept] == ["2026_Q1"]
    assert len(superseded) == 2


def test_multiple_rows_same_latest_wave_all_kept():
    # an employee may list several topics in the same (latest) wave
    surveys = [
        _s("E1", "2026_Q1", ["A"]),
        _s("E1", "2026_Q1", ["B"]),
        _s("E1", "2025_Q4", ["old"]),
    ]
    kept, superseded = resolve_latest_survey_per_employee(surveys)
    assert {tuple(k["requested_skills"]) for k in kept} == {("A",), ("B",)}
    assert len(superseded) == 1


def test_independent_per_employee():
    surveys = [
        _s("E1", "2025_Q4", ["A"]),
        _s("E2", "2026_Q1", ["B"]),
    ]
    kept, superseded = resolve_latest_survey_per_employee(surveys)
    # each employee's only wave is their latest -> nothing superseded
    assert len(kept) == 2 and superseded == []
