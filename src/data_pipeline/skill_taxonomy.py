"""Skill taxonomy & deterministic text helpers — foundation for the whole pipeline.

Three responsibilities, all DETERMINISTIC (no LLM, no fuzzy matching):

1. SKILL_MAP        : alias -> canonical, for fields that are already skill lists
                      (DS01 Skill, DS02 Required_Skills, DS04 Expertise).
2. SKILL_KEYWORDS   : keyword/phrase -> canonical, to EXTRACT skills from free text
                      (DS03 Training_Topic, DS05 Goal_Description). Real data stores
                      these as sentences, not skill tokens — guideline mock data did not.
3. quarter_to_dates : parse "Q1-Q2 2025" / "Q3_2025" / "Q4 2025-Q1 2026" -> (start, end).

Demo note: when a judge asks "how do you know this BOD goal needs Kubernetes?",
the answer is SKILL_KEYWORDS — a hardcoded rule table, not an LLM guess.
"""

from __future__ import annotations

import re
from datetime import date

# ---------------------------------------------------------------------------
# 1. SKILL_MAP — alias (lowercased) -> canonical name
#    Built from the real variants observed in DS01/DS02/DS04.
# ---------------------------------------------------------------------------
SKILL_MAP: dict[str, str] = {
    # containers / orchestration
    "k8s": "Kubernetes",
    "k8s orchestration": "Kubernetes",
    "kubernetes": "Kubernetes",
    "container orchestration": "Kubernetes",
    "docker": "Docker",
    "containerization": "Containerization",
    # frontend frameworks
    "reactjs": "React",
    "react": "React",
    "react.js": "React",
    "react native": "React Native",
    "nodejs": "Node.js",
    "node.js": "Node.js",
    "node": "Node.js",
    "nestjs": "NestJS",
    "nextjs": "Next.js",
    "next.js": "Next.js",
    "vuejs": "Vue.js",
    "vue": "Vue.js",
    "angular": "Angular",
    # backend / languages
    "springboot": "Spring Boot",
    "spring boot": "Spring Boot",
    "javaee": "Java EE",
    "golang": "Go",
    "go": "Go",
    "go gin": "Go",
    "grpc": "gRPC",
    "c#": "C#",
    "c/c++": "C/C++",
    "c++": "C++",
    "asp.net": ".NET",
    "asp.net core": ".NET",
    ".net": ".NET",
    "dotnet": ".NET",
    "js": "JavaScript",
    "javascript": "JavaScript",
    "ts": "TypeScript",
    "typescript": "TypeScript",
    "fastapi": "FastAPI",
    "fast api": "FastAPI",
    "flask": "Flask",
    "django": "Django",
    "laravel": "Laravel",
    # data / databases
    "postgres": "PostgreSQL",
    "postgresql": "PostgreSQL",
    "mssql": "SQL Server",
    "ms sql": "SQL Server",
    "mssql server": "SQL Server",
    "sql server": "SQL Server",
    "mysql": "MySQL",
    "oracle": "Oracle",
    "oracle sql": "Oracle",
    "mongodb": "MongoDB",
    "bigquery": "BigQuery",
    "pyspark": "PySpark",
    "spark": "Spark",
    "apache spark": "Spark",
    # cloud
    "gcloud": "GCP",
    "gcp": "GCP",
    "google cloud": "GCP",
    "aws": "AWS",
    "azure": "Azure",
    # AI / ML
    "llm": "LLM/GenAI",
    "llm tools": "LLM/GenAI",
    "genai": "LLM/GenAI",
    "llm/genai": "LLM/GenAI",
    "machine learning": "Machine Learning",
    "machine learning libraries": "Machine Learning",
    "ml": "Machine Learning",
    "mlops": "MLOps",
    "pytorch": "PyTorch",
    "tensorflow": "TensorFlow",
    "scikit-learn": "Scikit-learn",
    "langchain": "LangChain",
    # devops / infra
    "ci/cd": "CI/CD",
    "cicd": "CI/CD",
    "ci-cd": "CI/CD",
    "devops": "DevOps",
    "devsecops": "DevSecOps",
    "iac": "IaC",
    "infrastructure as code": "IaC",
    "terraform": "Terraform",
    "ansible": "Ansible",
    "jenkins": "Jenkins",
    "github actions": "GitHub Actions",
    # testing
    "automation testing": "Automation Testing",
    "selenium": "Selenium",
    "playwright": "Playwright",
    "cypress": "Cypress",
    # design
    "figma": "Figma",
    "ui/ux": "UI/UX",
    "ui/ux design": "UI/UX",
}

# ---------------------------------------------------------------------------
# 2. SKILL_KEYWORDS — substring keyword -> canonical, for FREE TEXT extraction.
#    Order matters only for readability; extraction dedups by canonical.
#    Keep keywords lowercase; matching is done on a lowercased copy of the text.
# ---------------------------------------------------------------------------
SKILL_KEYWORDS: list[tuple[str, str]] = [
    ("container orchestration", "Kubernetes"),
    ("kubernetes", "Kubernetes"),
    ("cka", "Kubernetes"),
    ("microservice", "Microservices"),
    ("ci/cd", "CI/CD"),
    ("devsecops", "DevSecOps"),
    ("devops", "DevOps"),
    ("infrastructure as code", "IaC"),
    ("iac", "IaC"),
    ("cloud-native", "Cloud"),
    ("cloud", "Cloud"),
    ("aws", "AWS"),
    ("azure", "Azure"),
    ("gcp", "GCP"),
    ("mlops", "MLOps"),
    ("deep learning", "Deep Learning"),
    ("machine learning", "Machine Learning"),
    ("data engineering", "Data Engineering"),
    ("data pipeline", "Data Engineering"),
    ("fine-tuning", "LLM/GenAI"),
    ("fine tuning", "LLM/GenAI"),
    ("genai", "LLM/GenAI"),
    ("llm", "LLM/GenAI"),
    ("rag", "LLM/GenAI"),
    ("ai agent", "AI Agent"),
    ("agentic", "AI Agent"),
    ("ai tools", "AI Tools"),
    ("ai application", "AI Tools"),
    ("ai adoption", "AI Tools"),
    ("ai for developer", "AI Tools"),
    ("ai-assisted", "AI Tools"),
    ("ai-powered", "AI Tools"),
    ("automation testing", "Automation Testing"),
    ("automation test", "Automation Testing"),
    ("playwright", "Playwright"),
    ("selenium", "Selenium"),
    ("performance testing", "Performance Testing"),
    ("security testing", "Security Testing"),
    ("istqb", "Automation Testing"),
    ("system design", "System Design"),
    ("architecture", "System Design"),
    ("system architecture", "System Design"),
    ("spring boot", "Spring Boot"),
    ("reactjs", "React"),
    ("react", "React"),
    ("nodejs", "Node.js"),
    ("node.js", "Node.js"),
    ("golang", "Go"),
    ("go language", "Go"),
    ("go development", "Go"),
    ("python", "Python"),
    ("typescript", "TypeScript"),
    ("javascript", "JavaScript"),
    ("frontend", "Frontend"),
    ("backend", "Backend"),
    ("scrum master", "Agile/Scrum"),
    ("scrum", "Agile/Scrum"),
    ("agile", "Agile/Scrum"),
    ("strategic planning", "Leadership"),
    ("technical leadership", "Leadership"),
    ("leadership", "Leadership"),
    ("team management", "Leadership"),
    ("people management", "Leadership"),
    ("stakeholder", "Leadership"),
    ("project management", "Project Management"),
    ("product management", "Product Management"),
    ("pmp", "Project Management"),
    ("security", "Security"),
    ("threat", "Security"),
    ("communication", "Communication"),
    ("interview skill", "Interview Skills"),
    ("english", "English"),
    ("japanese", "Foreign Language"),
    ("foreign language", "Foreign Language"),
    ("soft skill", "Soft Skills"),
    ("planning skill", "Planning"),
    ("time management", "Planning"),
    ("data analysis", "Data Analysis"),
    ("data scientist", "Data Science"),
    ("data science", "Data Science"),
    ("model deployment", "Model Deployment"),
    ("3d design", "3D Design"),
    ("motion design", "Motion Design"),
    ("ux analysis", "UI/UX"),
    ("ui motion", "UI/UX"),
]


def normalize_skill(skill: str) -> str:
    """Map one raw skill token to its canonical form.

    - Strip + lowercase for lookup in SKILL_MAP.
    - On hit, return canonical; on miss, return a cleaned title-case of the
      original (NEVER raise — an unknown skill must not crash the pipeline).
    """
    if skill is None:
        return ""
    cleaned = skill.strip()
    if not cleaned:
        return ""
    key = cleaned.lower()
    if key in SKILL_MAP:
        return SKILL_MAP[key]
    # Unknown skill: preserve acronyms ("SQL", "HTML", "API") and any token that
    # already carries internal capitals ("Tableau", "GraphQL"); otherwise
    # title-case it. Never raise — an unknown skill must not crash the pipeline.
    if cleaned != cleaned.lower():
        return cleaned
    return cleaned.title()


_PAREN_GROUP_RE = re.compile(r"([^,;()]+)\(([^()]*)\)")


def _expand_paren_groups(text: str) -> str:
    """Turn 'Label (a, b, c)' into 'Label;a;b;c' before the outer ;/, split runs.

    Most real parenthetical notes have no internal comma (e.g. "Version Control
    (Git)", "Security (OWASP)") — those are left untouched, they already survive
    the outer split intact. But DS01 EMP-100 has "DevOps (AWS, Terraform, K8s)":
    splitting that on a bare [;,] regex cuts INSIDE the parens and produces
    garbage tokens "DevOps (AWS" / "K8s)" that never match SKILL_MAP. Expanding
    first makes the inner commas item separators too, same as the outer ones.
    """
    def expand(m: re.Match[str]) -> str:
        label, inner = m.group(1), m.group(2)
        if "," not in inner and ";" not in inner:
            return m.group(0)
        parts = [label.strip(), *(p.strip() for p in re.split(r"[;,]", inner))]
        return ";".join(p for p in parts if p)

    return _PAREN_GROUP_RE.sub(expand, text)


def normalize_skill_list(skills_str: str) -> list[str]:
    """Split a raw skill string on commas OR semicolons and normalize each.

    Real data mixes both separators, sometimes within one cell
    (e.g. DS01 Skill_Gap: "Cloud, Automation; Version Control (Git)").
    Duplicates are removed, first-seen order preserved.
    """
    if not skills_str or not str(skills_str).strip():
        return []
    expanded = _expand_paren_groups(str(skills_str))
    parts = re.split(r"[;,]", expanded)
    out: list[str] = []
    seen: set[str] = set()
    for part in parts:
        canon = normalize_skill(part)
        if canon and canon not in seen:
            seen.add(canon)
            out.append(canon)
    return out


def _keyword_pattern(keyword: str) -> re.Pattern[str]:
    """Short keywords (<=5 chars: aws, rag, llm, cloud, react...) get word
    boundaries — a bare substring check false-positives badly at this length
    (e.g. "rag" inside "storage"/"average"). Longer phrases keep plain substring
    matching on purpose: it is what lets "microservice" also catch "microservices"
    and "ai-powered" catch "ai-powered solution" without listing every inflection.
    """
    escaped = re.escape(keyword)
    return re.compile(rf"\b{escaped}\b" if len(keyword) <= 5 else escaped)


_KEYWORD_PATTERNS: list[tuple[re.Pattern[str], str, str]] = [
    (_keyword_pattern(keyword), keyword, canon) for keyword, canon in SKILL_KEYWORDS
]


def extract_skills_with_evidence(text: str) -> list[dict]:
    """Like extract_skills_from_text, but records WHICH keyword triggered each skill.

    Returns [{"skill": canon, "matched_keyword": kw}, ...]. This is the audit trail
    that lets a demo answer "this MLOps came from the phrase 'llm-serving' in DS05"
    instead of "trust me". Dedups by canonical, first-match keyword wins.
    """
    if not text or not str(text).strip():
        return []
    low = str(text).lower()
    out: list[dict] = []
    seen: set[str] = set()
    for pattern, keyword, canon in _KEYWORD_PATTERNS:
        if canon not in seen and pattern.search(low):
            seen.add(canon)
            out.append({"skill": canon, "matched_keyword": keyword})
    return out


def extract_skills_from_text(text: str) -> list[str]:
    """Extract canonical skills from FREE TEXT using SKILL_KEYWORDS (deterministic).

    Used for DS03 Training_Topic and DS05 Goal_Description, which are sentences.
    Returns [] when no keyword matches (we never fabricate a skill).
    Dedups by canonical, preserving first-match order.
    """
    return [item["skill"] for item in extract_skills_with_evidence(text)]


# ---------------------------------------------------------------------------
# 3. Quarter parsing — DS02 Timeline and DS05 Target_Quarter
# ---------------------------------------------------------------------------
_QUARTER_END = {1: (3, 31), 2: (6, 30), 3: (9, 30), 4: (12, 31)}
_QUARTER_START = {1: (1, 1), 2: (4, 1), 3: (7, 1), 4: (10, 1)}

# Matches "Q3", "Q3 2025", "Q3_2025"; year captured separately when present.
_Q_TOKEN = re.compile(r"Q([1-4])(?:[ _]?(\d{4}))?", re.IGNORECASE)


def quarter_to_dates(raw: str) -> tuple[date | None, date | None]:
    """Parse a quarter/timeline string into (start_date, end_date).

    Handles real formats:
      "Q1-Q2 2025"        -> (2025-01-01, 2025-06-30)   (en-dash or hyphen)
      "Q3_2025"           -> (2025-07-01, 2025-09-30)
      "Q4 2025-Q1 2026"   -> (2025-10-01, 2026-03-31)   (spans year)
    Returns (None, None) on unparseable input — caller degrades gracefully.
    """
    if not raw or not str(raw).strip():
        return (None, None)
    # Normalize various dash characters to a plain hyphen.
    s = str(raw).replace("–", "-").replace("—", "-").strip()
    matches = list(_Q_TOKEN.finditer(s))
    if not matches:
        return (None, None)

    # Collect (quarter, year) pairs; backfill missing years from the last seen.
    years = [int(m.group(2)) for m in matches if m.group(2)]
    if not years:
        return (None, None)
    default_year = years[-1]

    parsed: list[tuple[int, int]] = []
    for m in matches:
        q = int(m.group(1))
        y = int(m.group(2)) if m.group(2) else default_year
        parsed.append((q, y))

    first_q, first_y = parsed[0]
    last_q, last_y = parsed[-1]
    sm, sd = _QUARTER_START[first_q]
    em, ed = _QUARTER_END[last_q]
    return (date(first_y, sm, sd), date(last_y, em, ed))
