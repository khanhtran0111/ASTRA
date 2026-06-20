"""ASTRA data pipeline entry point.

Usage:
    python run_pipeline.py --data-dir data --output-dir data/processed
    python run_pipeline.py --dry-run
    python run_pipeline.py --today 2026-06-18      # reproducible demo run
"""

from __future__ import annotations

import argparse
import os
from datetime import date

from src.data_pipeline.pipeline import SCORING_FORMULA, run_pipeline


def _fmt_kb(path: str) -> str:
    return f"{os.path.getsize(path) / 1024:.1f} KB" if os.path.exists(path) else "not written"


def main() -> None:
    ap = argparse.ArgumentParser(description="ASTRA deterministic data pipeline")
    ap.add_argument("--data-dir", default="data", help="folder with DS01-DS05 CSVs")
    ap.add_argument("--output-dir", default="data/processed", help="where JSON outputs go")
    ap.add_argument("--today", default="2026-06-18", help="run date (YYYY-MM-DD) for reproducibility")
    ap.add_argument("--dry-run", action="store_true", help="run without writing files")
    args = ap.parse_args()

    run_date = date.fromisoformat(args.today)
    result = run_pipeline(
        args.data_dir, args.output_dir, today=run_date, write=not args.dry_run
    )

    summary = result["summary"]
    meta = result["metadata"]
    files = result["files"]

    print("\n" + ("=" * 60))
    print("  ASTRA Pipeline complete" + ("  (dry-run)" if args.dry_run else ""))
    print("=" * 60)
    if not args.dry_run:
        print(f"  normalized_data.json   ({_fmt_kb(files['normalized'])})")
        print(f"  skill_gap_result.json  ({_fmt_kb(files['gaps'])})")
        print(f"  priority_result.json   ({_fmt_kb(files['priorities'])})")
        print(f"  insights_report.json   ({_fmt_kb(files['insights'])})")
    print("\n  Summary:")
    print(f"  - Employees analyzed : {meta['total_employees_analyzed']}")
    print(f"  - Employees w/ target gaps : {meta['employees_with_target_gaps']}")
    print(f"  - Initiatives scored : {meta['total_initiatives_scored']}")
    if meta["high_priority_sourcing_flags"]:
        print(f"  - Sourcing flags (P1/P2, no trainee): {meta['high_priority_sourcing_flags']}")
    print(f"  - P1 skills : {summary['P1']}")
    print(f"  - P2 skills : {summary['P2'][:8]}{' ...' if len(summary['P2']) > 8 else ''}")
    print(f"  - P3 skills : {len(summary['P3'])} skills")
    print(f"  - Source status : {meta['source_status']}")
    print(f"  - Scoring formula: {SCORING_FORMULA}")


if __name__ == "__main__":
    main()
