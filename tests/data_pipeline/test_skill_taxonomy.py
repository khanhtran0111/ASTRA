"""Unit tests for skill_taxonomy — normalization, free-text extraction, quarter parsing."""

from datetime import date

import pytest

from src.data_pipeline.skill_taxonomy import (
    extract_skills_from_text,
    normalize_skill,
    normalize_skill_list,
    quarter_to_dates,
)


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("k8s", "Kubernetes"),
        ("K8s", "Kubernetes"),
        ("Kubernetes", "Kubernetes"),
        ("ReactJS", "React"),
        ("react", "React"),
        ("SpringBoot", "Spring Boot"),
        ("Spring Boot", "Spring Boot"),
        ("ci/cd", "CI/CD"),
        ("GCloud", "GCP"),
        ("NodeJS", "Node.js"),
    ],
)
def test_normalize_known_aliases(raw, expected):
    assert normalize_skill(raw) == expected


def test_normalize_preserves_acronyms():
    # all-caps acronyms must not become title-case ("SQL" -> "Sql")
    assert normalize_skill("SQL") == "SQL"
    assert normalize_skill("HTML") == "HTML"


def test_normalize_unknown_is_titlecased_not_crashing():
    assert normalize_skill("tableau") == "Tableau"
    assert normalize_skill("") == ""


def test_skill_list_mixed_separators_and_dedup():
    # real data mixes ',' and ';' and casing variants in one cell
    result = normalize_skill_list("Python, k8s; python; K8s, ReactJS")
    assert result.count("Kubernetes") == 1
    assert result.count("Python") == 1
    assert result == ["Python", "Kubernetes", "React"]


def test_skill_list_empty():
    assert normalize_skill_list("") == []
    assert normalize_skill_list("   ") == []


def test_extract_skills_from_free_text():
    # DS03 / DS05 store sentences, not skill tokens
    assert extract_skills_from_text("CI/CD and DevOps fundamentals") == ["CI/CD", "DevOps"]
    assert "Kubernetes" in extract_skills_from_text("Microservices and container orchestration")
    # order follows the keyword-table order, not the sentence order
    assert sorted(extract_skills_from_text("Upskill in cloud-native (Kubernetes, CI/CD, IaC)")) == [
        "CI/CD",
        "Cloud",
        "IaC",
        "Kubernetes",
    ]


def test_extract_returns_empty_when_no_keyword():
    # "personal agent" is intentionally NOT matched: only precise keywords like
    # "ai agent"/"agentic" map to AI Agent, to avoid broad false positives.
    assert extract_skills_from_text("Build personal agent to enhance workflow") == []
    assert extract_skills_from_text("Not sure yet") == []


def test_quarter_single():
    assert quarter_to_dates("Q3_2025") == (date(2025, 7, 1), date(2025, 9, 30))


def test_quarter_range_same_year():
    assert quarter_to_dates("Q1–Q2 2025") == (date(2025, 1, 1), date(2025, 6, 30))


def test_quarter_range_spanning_year():
    # "Q4 2025–Q1 2026" must end at end of Q1 2026
    assert quarter_to_dates("Q4 2025–Q1 2026") == (date(2025, 10, 1), date(2026, 3, 31))


def test_quarter_unparseable():
    assert quarter_to_dates("") == (None, None)
    assert quarter_to_dates("sometime") == (None, None)


# --- [FIX #2] Regression canaries on the HARDEST real goal/survey sentences. ---
# If one of these fails, the keyword table missed/over-matched a real-data signal.


def test_extract_goal_2025_11_llm_serving():
    """GOAL-2025-11: 'modern LLM-serving technology stacks' + DevOps must be caught."""
    text = (
        "Build next-generation DevOps capability capable of supporting AI-heavy "
        "projects with high traffic, using modern LLM-serving technology stacks."
    )
    result = extract_skills_from_text(text)
    assert "DevOps" in result, f"missed DevOps signal: {result}"
    assert "LLM/GenAI" in result, f"missed LLM-serving signal: {result}"


def test_extract_goal_2026_07_cloud_native():
    """GOAL-2026-07: the cloud-native goal must yield Kubernetes + CI/CD + IaC."""
    text = (
        "Upskill at least 60% of development team in cloud-native technologies "
        "(Kubernetes, CI/CD, IaC) to support cloud-first project delivery."
    )
    result = set(extract_skills_from_text(text))
    assert {"Kubernetes", "CI/CD", "IaC"} <= result, f"missed cloud-native signals: {result}"


def test_no_overmatch_on_leadership_sentence():
    """GOAL-2026-01: a pure leadership goal must NOT pull in technical skills."""
    text = (
        "Develop next-generation leadership pipeline with team-leading capability "
        "and strong communication skills to support organizational growth."
    )
    result = extract_skills_from_text(text)
    assert "Kubernetes" not in result and "DevOps" not in result
    assert "Leadership" in result
