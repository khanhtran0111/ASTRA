"""ASTRA data pipeline — deterministic data layer (no LLM).

Pipeline: loader -> normalizer -> gap_analyzer -> prioritizer -> pipeline.
Output JSON in data/processed/ is the only handoff to Agent 1.
"""
