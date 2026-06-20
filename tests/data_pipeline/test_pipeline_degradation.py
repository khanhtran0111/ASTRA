"""Graceful-degradation tests [FIX-Huy]: a missing/broken source must not crash the flow."""

import csv
from datetime import date

from src.data_pipeline.loader import load_all_data
from src.data_pipeline.pipeline import run_pipeline

REAL_SOURCES = {
    "DS01_Employee_Skill_Profile.csv": ["Employee_ID", "Position", "Skill", "Proficiency_Level", "Skill_Gap"],
    "DS02_Project_Roadmap.csv": ["Project_ID", "Required_Skills", "Timeline"],
    "DS03_Training_Need_Survey.csv": ["Survey_ID", "Employee_ID", "Training_Topic", "Priority"],
    "DS04_Internal_Trainer_List.csv": ["Trainer_ID", "Expertise", "Availability_Hours_Per_Month"],
    "DS05_BOD_Training_Goals.csv": ["Goal_ID", "Goal_Description", "Target_Quarter"],
}


def _write_csv(path, header, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def _make_minimal_dataset(d, skip=None, break_cols=None):
    """Write a tiny valid dataset, optionally skipping or corrupting one source."""
    for fname, header in REAL_SOURCES.items():
        if fname == skip:
            continue
        cols = ["wrong_col"] if fname == break_cols else header
        _write_csv(str(d / fname), cols, [])


def test_missing_bod_source_degrades_not_crashes(tmp_path):
    out = tmp_path / "out"
    _make_minimal_dataset(tmp_path, skip="DS05_BOD_Training_Goals.csv")
    # Put one real employee+project so there is something to score.
    _write_csv(
        str(tmp_path / "DS01_Employee_Skill_Profile.csv"),
        REAL_SOURCES["DS01_Employee_Skill_Profile.csv"],
        [["EMP-1", "Dev", "Java", "Junior", "Docker"]],
    )
    _write_csv(
        str(tmp_path / "DS02_Project_Roadmap.csv"),
        REAL_SOURCES["DS02_Project_Roadmap.csv"],
        [["PRJ-1", "Docker", "Q3 2026"]],
    )
    result = run_pipeline(str(tmp_path), str(out), today=date(2026, 6, 18), write=True)
    assert result["metadata"]["source_status"]["DS05"].startswith("error")
    assert result["metadata"]["source_status"]["DS01"] == "ok"
    # pipeline still produced initiatives despite missing DS05
    assert result["metadata"]["total_initiatives_scored"] >= 1


def test_broken_columns_reported_not_raised(tmp_path):
    _make_minimal_dataset(tmp_path, break_cols="DS04_Internal_Trainer_List.csv")
    data = load_all_data(str(tmp_path))
    assert data["_source_status"]["DS04"].startswith("error")
    assert data["trainers"] == []
    # other sources unaffected
    assert data["_source_status"]["DS01"] == "ok"
