"""Step 1 — Load & validate the 5 real CSV sources (DS01-DS05).

Schema is the REAL data schema, not the guideline mock:
  DS01 Employee_Skill_Profile : Employee_ID, Position, Skill, Proficiency_Level, Skill_Gap
  DS02 Project_Roadmap        : Project_ID, Required_Skills, Timeline
  DS03 Training_Need_Survey   : Survey_ID, Employee_ID, Training_Topic, Priority
  DS04 Internal_Trainer_List  : Trainer_ID, Expertise, Availability_Hours_Per_Month
  DS05 BOD_Training_Goals     : Goal_ID, Goal_Description, Target_Quarter

[FIX-Huy] Graceful degradation: each file is loaded in isolation. If one file is
missing or malformed, we record it in `_source_status` and KEEP the other sources
so the pipeline degrades instead of crashing end-to-end.
"""

from __future__ import annotations

import os

import pandas as pd

# (filename, output key, required columns)
_SOURCES: list[tuple[str, str, list[str]]] = [
    (
        "DS01_Employee_Skill_Profile.csv",
        "employees",
        ["Employee_ID", "Position", "Skill", "Proficiency_Level", "Skill_Gap"],
    ),
    ("DS02_Project_Roadmap.csv", "projects", ["Project_ID", "Required_Skills", "Timeline"]),
    (
        "DS03_Training_Need_Survey.csv",
        "surveys",
        ["Survey_ID", "Employee_ID", "Training_Topic", "Priority"],
    ),
    (
        "DS04_Internal_Trainer_List.csv",
        "trainers",
        ["Trainer_ID", "Expertise", "Availability_Hours_Per_Month"],
    ),
    ("DS05_BOD_Training_Goals.csv", "goals", ["Goal_ID", "Goal_Description", "Target_Quarter"]),
]

# Map output key -> DS code, for status reporting.
_DS_CODE = {
    "employees": "DS01",
    "projects": "DS02",
    "surveys": "DS03",
    "trainers": "DS04",
    "goals": "DS05",
}


def _load_one(path: str, required: list[str]) -> list[dict]:
    """Read one CSV, validate required columns, return list of row dicts.

    Raises ValueError (missing columns) or FileNotFoundError — caller decides
    whether to abort or degrade.
    """
    if not os.path.exists(path):
        raise FileNotFoundError(f"CSV not found: {path}")
    df = pd.read_csv(path, dtype=str, keep_default_na=False)
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"{os.path.basename(path)} missing required columns: {missing}")
    return df.to_dict(orient="records")


def load_all_data(data_dir: str) -> dict:
    """Load all 5 sources from `data_dir`.

    Returns a dict with keys employees/projects/surveys/trainers/goals (each a
    list of row dicts) plus `_source_status` mapping each DS code to "ok" or an
    error message. Missing/broken sources yield an empty list, never an exception.
    """
    result: dict = {
        "employees": [],
        "projects": [],
        "surveys": [],
        "trainers": [],
        "goals": [],
        "_source_status": {},
    }
    for filename, key, required in _SOURCES:
        path = os.path.join(data_dir, filename)
        ds_code = _DS_CODE[key]
        try:
            result[key] = _load_one(path, required)
            result["_source_status"][ds_code] = "ok"
        except (FileNotFoundError, ValueError) as exc:
            result[key] = []
            result["_source_status"][ds_code] = f"error: {exc}"
            print(f"[loader][WARN] {ds_code} unavailable -> {exc} (degrading, pipeline continues)")
    return result
