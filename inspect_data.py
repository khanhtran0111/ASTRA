"""Interactive inspector for the data-pipeline output — test/demo without the app.

Run the pipeline first (`python run_pipeline.py --today 2026-06-18`), then query:

    python inspect_data.py top                 # P1/P2/P3 overview
    python inspect_data.py skill Kubernetes    # why this tier? breakdown, trainers, supply
    python inspect_data.py employee EMP-001    # one employee's 4 gap views
    python inspect_data.py findings            # answer-key findings F-01..F-04
    python inspect_data.py trainer-gaps        # demanded skills with no internal trainer
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

OUT = Path("data/processed")


def _load(name: str):
    path = OUT / name
    if not path.exists():
        sys.exit(f"Missing {path}. Run: python run_pipeline.py --today 2026-06-18")
    return json.loads(path.read_text(encoding="utf-8"))


def cmd_top() -> None:
    pr = _load("priority_result.json")
    s = pr["summary"]
    print("P1 (train internally now):", s["P1"])
    print("P2 (queue after P1):      ", s["P2"])
    print(f"P3 ({len(s['P3'])} skills, sourcing/low signal):", s["P3"][:12], "...")


def cmd_skill(name: str) -> None:
    pr = _load("priority_result.json")
    it = next((i for i in pr["initiatives"] if i["skill"].lower() == name.lower()), None)
    if not it:
        print(f"'{name}' is not a demanded skill (not in any project/BOD). Demanded skills:")
        print(", ".join(sorted(i["skill"] for i in pr["initiatives"])))
        return
    b = it["score_breakdown"]
    print(f"=== {it['skill']}  ->  {it['priority_tier']}  (total {it['total_score']}) ===")
    print(f"  why: bod={b['bod_alignment']} project={b['project_alignment']} "
          f"urgency={b['urgency_bonus']} survey={b['survey_score']} "
          f"bod_weight={b['bod_strategic_weight_bonus']}  (sum={sum(b.values())})")
    print(f"  evidence : {it['evidence_summary']}")
    print(f"  trainees : {it['target_employee_count']} -> {it['target_employees'][:10]}"
          + (" ..." if it['target_employee_count'] > 10 else ""))
    print(f"  supply   : {it['current_holder_count']} employee(s) already have it")
    print(f"  trainer  : {'internal -> ' + str(it['internal_trainers']) if it['internal_trainer_available'] else 'NO internal trainer'}")
    print(f"  projects : {it['supporting_projects']}   BOD: {it['supporting_bod_goals']}")
    if "warning" in it:
        print(f"  WARNING  : {it['warning']}")
    if "trainer_gap" in it:
        print(f"  TRAINER GAP: {it['trainer_gap']}")


def cmd_employee(eid: str) -> None:
    sg = _load("skill_gap_result.json")
    e = next((g for g in sg if g["employee_id"].lower() == eid.lower()), None)
    if not e:
        print(f"No employee '{eid}'. Example IDs: EMP-001 .. EMP-205")
        return
    print(f"=== {e['employee_id']} | {e['position']} | {e['proficiency_level']} ===")
    print(f"  has now        : {e['current_skills']}")
    print(f"  declared_gap   : {e['declared_gap']}        (DS01 Skill_Gap, human)")
    print(f"  computed_gap   : {len(e['computed_gap'])} skills          (org demand - current, broad/audit)")
    print(f"  confirmed_gap  : {e['confirmed_gap']}        (declared AND computed = high confidence)")
    print(f"  target_skills  : {e['target_skills']}        (ACTIONABLE training list)")
    for sk, src in e["gap_sources"].items():
        flags = []
        if src["in_declared"]:
            flags.append("self-reported")
        if src["in_survey"]:
            flags.append("survey")
        print(f"    - {sk}: projects={src['projects']} bod={src['bod_goals']} signal={'/'.join(flags)}")


def cmd_findings() -> None:
    r = _load("insights_report.json")
    print("F-01 high-frequency declared gaps (top 5):")
    for x in r["F-01_declared_gap_frequency"]["ranking"][:5]:
        print(f"    {x['employee_count']:3d} ({x['percent_of_workforce']}%)  {x['skill']}")
    f2 = r["F-02_trainer_supply_demand"]
    print(f"F-02 trainers={f2['internal_trainer_count']}, demanded skills WITHOUT internal trainer: {f2['uncovered_count']}")
    print(f"    {[x['skill'] for x in f2['demanded_skills_without_trainer'][:8]]}")
    print("F-03 BOD goal coverage (goals with a % target):")
    for g in r["F-03_goal_coverage"]["goals"]:
        if g["target_percent"]:
            cov = ", ".join(f"{c['skill']} {c['current_percent']}%->train {c['employees_to_train']}"
                            for c in g["skills_coverage"])
            print(f"    {g['goal_id']} (target {g['target_percent']}%, dev_team {g['dev_team_size']}): {cov}")
    print("F-04 scarcest demanded skills (supply):")
    for x in r["F-04_skill_supply_index"]["supply"][:6]:
        print(f"    {x['holder_count']:3d} have  {x['skill']}{'  <-- SCARCE' if x['scarce'] else ''}")


def cmd_trainer_gaps() -> None:
    r = _load("insights_report.json")
    for x in r["F-02_trainer_supply_demand"]["demanded_skills_without_trainer"]:
        print(f"  [{x['priority_tier']}] {x['skill']:18s} {x['target_employee_count']} trainee(s) need it, 0 internal trainer")


def main() -> None:
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return
    cmd, rest = args[0], args[1:]
    dispatch = {
        "top": lambda: cmd_top(),
        "skill": lambda: cmd_skill(rest[0]) if rest else print("usage: skill <name>"),
        "employee": lambda: cmd_employee(rest[0]) if rest else print("usage: employee <EMP-id>"),
        "findings": lambda: cmd_findings(),
        "trainer-gaps": lambda: cmd_trainer_gaps(),
    }
    fn = dispatch.get(cmd)
    if not fn:
        print(__doc__)
        return
    fn()


if __name__ == "__main__":
    main()
