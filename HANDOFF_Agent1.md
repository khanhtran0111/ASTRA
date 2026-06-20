# HANDOFF — Data Layer → Agent 1 (Coordinator)

> Từ: Người 1 (Data Workstream). Tới: người dựng Agent 1 / Agent 2.
> File này là **contract chính thức** giữa data layer và Agent 1. Đọc §2 (rule bắt buộc) trước khi code matching.

---

## 0. CHẠY TỪ ĐẦU (bắt buộc làm trước khi đọc output)

> ⚠️ **4 file JSON KHÔNG nằm trong repo** (đã gitignore vì là build artifact). Repo chỉ
> có **5 CSV gốc** (`data/DS01–05`) + code. Bạn **phải chạy pipeline** để sinh JSON.

**Yêu cầu:** Python 3.10+ (đã test trên 3.11).

```bash
# từ thư mục gốc repo (d:/SETA/ASTRA hoặc nơi bạn clone)
pip install -r requirements.txt              # pandas + pytest
python run_pipeline.py --today 2026-06-18     # đọc 5 CSV -> sinh 4 JSON, deterministic, KHÔNG gọi LLM
```

Sau khi chạy, 4 file xuất hiện trong `data/processed/`:
```
normalized_data.json   skill_gap_result.json   priority_result.json   insights_report.json
```

**Kiểm tra / khám phá nhanh (không bắt buộc):**
```bash
pytest tests/data_pipeline/ -q               # 51/51 PASS -> logic đúng
python inspect_data.py top                   # tổng quan P1/P2/P3
python inspect_data.py skill Kubernetes      # vì sao 1 skill là P1
python inspect_data.py employee EMP-001      # gap của 1 nhân viên
python inspect_data.py findings              # 4 finding F-01..F-04
```

**Trạng thái output hiện tại:** 205 nhân viên · 180 có target gap · 79 initiative (P1×4, P2×21, P3×54) · 5 sourcing flag. Chạy bao nhiêu lần cũng ra y hệt (`--today` cố định, default 2026-06-18).

- **Agent 1 chỉ đọc 2 file để loop:** `priority_result.json` + `normalized_data.json`.
- **`insights_report.json`** = 4 finding phân tích sẵn (F-01..F-04) — dùng khi Agent/Agent 2 cần báo cáo cho judge (xem §5b). Không bắt buộc cho loop chính.

---

## 1. Data layer đã làm gì (để hiểu vì sao tin được output)

Pipeline 4 bước deterministic, không LLM:

1. **Load + validate** 5 CSV thật (DS01–DS05). Thiếu/hỏng 1 nguồn → degrade, ghi `source_status`, không sập.
2. **Normalize**: gom mọi biến thể tên skill về 1 canonical (k8s/K8s/Kubernetes → `Kubernetes`); trích skill từ **câu free-text** ở DS03 (training topic) và DS05 (mô tả goal) bằng bảng keyword cứng; parse timeline dạng quý → ngày; suy `strategic_weight` cho BOD goal (DS05 thật không có).
3. **Gap analysis**: với mỗi nhân viên, so `current_skills` với nhu cầu org bằng set intersection thuần.
4. **Prioritize**: chấm điểm từng skill theo công thức cứng `bod(50)+project(30)+urgency(10)+survey(max10)+bod_weight(max10)`, xếp P1/P2/P3, tie-break 4 cấp.

**Vấn đề đã giải quyết sẵn ở data layer (Agent 1 KHÔNG cần làm lại):**
Project/BOD không gán cho từng người, nên nếu lấy "mọi skill org cần − skill cá nhân" thì gần như cả 205 người thiếu ~74 skill → danh sách trainee toàn noise. Data layer đã lọc còn **target thật**: chỉ người vừa thiếu skill, vừa **tự phát tín hiệu cần học** (qua survey DS03 hoặc cột Skill_Gap DS01). Kết quả `target_employees` đã sạch.

---

## 2. ⛔ RULE BẮT BUỘC — field nào dùng cho matching, field nào KHÔNG

| Mục đích | DÙNG field này | TUYỆT ĐỐI KHÔNG dùng |
|---|---|---|
| Xác định **ai cần train** (trainee pool) | `initiatives[].target_employees` (đã qua lọc 3 chiều: demanded ∩ lacking ∩ signalled) | `declared_gap`, `computed_gap`, `confirmed_gap` |
| Đếm cohort | `initiatives[].target_employee_count` | `len(computed_gap)` |
| Skill cần train & thứ tự | `initiatives[]` (đã sort P1→P3) | tự gom từ gap record |

> **Vì sao:** `declared_gap` / `computed_gap` trong `skill_gap_result.json` **chỉ để audit/giải thích cho judge** — `computed_gap` là tập rộng (mỗi người ~70+ skill) để minh bạch, KHÔNG phải input matching. Nếu Agent 1 loop trên các field này (hoặc tự union chúng) sẽ **tái tạo lại đúng bài toán noise mà data layer đã chặn**. Chỉ `target_employees` là nguồn trainee hợp lệ.

---

## 3. Contract: `priority_result.json` (Agent 1 loop ở đây)

```jsonc
{
  "summary": { "P1": [...], "P2": [...], "P3": [...] },   // tên skill, đã sort
  "initiatives": [                                         // ĐÃ SORT P1->P3 — loop theo thứ tự này
    {
      "skill": "Kubernetes",                 // input cho get_curriculum & find_internal_trainer_by_skill
      "priority_tier": "P1",                 // P1 | P2 | P3
      "total_score": 98,                     // int
      "score_breakdown": {                   // sum == total_score (verify được)
        "bod_alignment": 50, "project_alignment": 30,
        "urgency_bonus": 0, "survey_score": 10, "bod_strategic_weight_bonus": 8
      },
      "target_employees": ["EMP-010", ...],  // ✅ NGUỒN TRAINEE DUY NHẤT (xem §2)
      "target_employee_count": 13,
      "supporting_projects": ["PRJ-002", ...],// project_id — tra deadline để check timeline
      "supporting_bod_goals": ["GOAL-2026-07"],
      "internal_trainer_available": true,    // [F-02] có trainer nội bộ dạy skill này không
      "internal_trainers": ["TRN-004"],      // [F-02] trainer_id dạy được — dùng cho find_internal_trainer_by_skill
      "current_holder_count": 6,             // [F-04] số nhân viên (toàn org 205) ĐANG CÓ skill = supply; khớp insights F-04
      "evidence_summary": "GOAL-2026-07 (weight=8); projects ...; 13 trainee(s).",
      "warning": "...",                      // CHỈ có khi P1/P2 mà target_employee_count==0
      "trainer_gap": "..."                   // CHỈ có khi có trainee cần nhưng KHÔNG trainer nội bộ
    }
  ],
  "metadata": {
    "high_priority_sourcing_flags": ["Docker","TensorFlow","LangChain","OpenAI API","Vector DB"],
    "source_status": {"DS01":"ok", ...},
    "scoring_formula": "bod(50)+project(30)+urgency(10)+survey(max10)+bod_weight(max10)",
    "tier_interpretation": {"P3":"sourcing gap, KHÔNG phải chỉ low priority", ...},
    "assumptions": [ ... ]
  }
}
```

### Agent 1 dùng từng field
1. **Loop** `initiatives` theo thứ tự (P1 trước).
2. `skill` → `get_existing_curriculum` / `generate_new_curriculum`.
3. **Nếu item có `warning`** (P1/P2 nhưng `target_employee_count==0`): skill org cần mà không ai signal → bỏ qua tìm trainee nội bộ, đẩy thẳng `propose_external_solution` (hiring/external). Đừng cố tìm trainee, sẽ rỗng.
4. `target_employees` → trainee candidate cho clustering.
5. `skill` → `find_internal_trainer_by_skill` (§4). Không có trainer → fallback external.
6. `supporting_projects` → tra `normalized_data.projects[].deadline` check timeline conflict.

---

## 4. Contract: `normalized_data.json` (trainer & employee lookup)

```jsonc
{
  "trainers": [
    { "trainer_id": "TRN-004",
      "skills": ["Java","Spring Boot","Python","Kubernetes","Docker","AWS","GCP","Terraform",...], // canonical, CÙNG từ vựng với initiative.skill
      "available_hours_per_month": 8 }      // int (đơn vị THÁNG)
  ],
  "employees": [
    { "employee_id": "EMP-001", "position": "Software Developer",
      "current_skills": ["C#","Python","React","Angular","SQL"],
      "proficiency_level": "Advanced" }     // Beginner | Intermediate | Advanced
  ],
  "projects": [ { "project_id":"PRJ-001", "required_skills":[...], "deadline":"2025-06-30" } ],
  "goals":    [ { "goal_id":"GOAL-2026-07", "required_skills":[...], "strategic_weight":8, "target_deadline":"2026-09-30" } ]
}
```

**Trainer matching:** `find_internal_trainer_by_skill(skill)` = lọc `trainers` có `skill in trainer.skills`. Đã verify từ vựng khớp exact (Kubernetes/DevOps/Python/LLM-GenAI…). Skill trừu tượng (System Design, AI Tools, CI/CD) thường không có trainer → fallback external — đúng thiết kế proposal.

> `skill_gap_result.json` chỉ để audit (giải thích nguồn gốc gap khi judge hỏi). **Agent 1 không loop trên file này** — xem §2.

---

## 5b. `insights_report.json` — 4 finding phân tích sẵn (cho báo cáo / QA)

Trả lời sẵn 4 finding trong answer key của dataset; Agent 2 (QA/báo cáo) có thể trích thẳng:

| Key | Finding | Nội dung |
|---|---|---|
| `F-01_declared_gap_frequency` | Gap tần suất cao nhất | Cột DS01 Skill_Gap xếp theo số nhân viên khai (top: Containerization 58, Cloud Services 48) |
| `F-02_trainer_supply_demand` | Cung vs cầu trainer | 10 trainer; danh sách skill có người cần nhưng **không trainer nội bộ** |
| `F-03_goal_coverage` | Coverage vs target BOD | Mỗi goal: % dev team đang có từng skill vs target (GOAL-2026-07: K8s 2.7% vs 60% → cần train 105) |
| `F-04_skill_supply_index` | Ai đang CÓ skill (cross-ref DS01) | Mỗi skill org cần: số người đang có + danh sách; flag `scarce` (AI Agent 0, LLM 1, MLOps 1) |

> Đây là phân tích deterministic ở data layer — không phải Agent suy luận. Dùng để demo "phát hiện này có bằng chứng số, không phải LLM đoán".

> **Cross-reference 2 chiều (bắt buộc):** `priority_result.json.metadata.cross_reference` ↔ `insights_report.json._cross_reference`. Con số trên initiative (`internal_trainer_available`, `current_holder_count`) **chính là** con số trong insights F-02/F-04 — đừng tính lại từ data thô. Lưu ý 2 mẫu số khác nhau có chủ đích: `current_holder_count` đếm **toàn org (205)**; F-03 coverage % đếm riêng **dev team (182)**.

---

## 5. Giới hạn data thật — Agent 1 cần GIẢ ĐỊNH, không đòi data layer cấp

| Thiếu trong data nguồn | Hệ quả | Agent 1 xử lý |
|---|---|---|
| DS04 không có `booked_projects` | Không check được xung đột lịch trainer-vs-project từ data | Chỉ dùng `available_hours_per_month`; giả định trainer rảnh |
| Không có curriculum / `total_hours` | LLM job của Agent 1 | `generate_new_curriculum` ước lượng hours |
| Không có "learner time budget" | `verify_learner_time_budget` không có nguồn | Agent 1 đặt giả định budget (vd X giờ/quý) |

---

## 6. Cam kết
- Field tên & kiểu ở §3–§4 ổn định; thay đổi → cập nhật file này + bump `pipeline_version`.
- Pipeline reproducible với `--today` cố định.

---

## 7. Self-audit — 3 lỗi thật đã verify (2026-06-20)

> Phát hiện khi copy code sang ASTRA VER2 và chạy lại pipeline nhiều lần để đối chiếu output. Cả 3 đều reproduce được bằng lệnh cụ thể bên dưới — không phải suy đoán. `priority_result.json` (file Agent 1 loop chính) **không bị ảnh hưởng**; cả 3 nằm ở `insights_report.json` (F-01) và ở bước normalize (rò xuống F-01/F-04).

**(a) F-01 không reproducible 100% — mâu thuẫn với cam kết "chạy bao nhiêu lần cũng ra y hệt" ở §0. ✅ ĐÃ FIX (2026-06-20).**
`declared_gap_frequency()` (`src/data_pipeline/insights.py:51`) lặp `for skill in set(emp.get("self_reported_gaps", []))` trước khi đưa vào `Counter`. Khi nhiều skill có `employee_count` bằng nhau (rất phổ biến ở đuôi danh sách, toàn `employee_count=1`), thứ tự giữa các skill hoà điểm phụ thuộc thứ tự duyệt `set` — bị chi phối bởi hash seed ngẫu nhiên mỗi process Python.
**Fix đã áp dụng**: bỏ `set()` thừa (list đã dedup sẵn từ `normalize_skill_list`), thay `counter.most_common()` bằng `sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))` — tie-break tường minh theo tên skill A→Z, không còn phụ thuộc thứ tự ngầm của dict/set. Đã verify: `pytest tests/data_pipeline/ -q` → 51/51 pass; chạy `run_pipeline.py --today 2026-06-18` 3 lần liên tiếp vào 3 output-dir khác nhau, `diff` từng cặp `insights_report.json` → khớp 100% (chỉ khác `generated_at`). Đã regenerate lại 4 JSON ở cả ASTRA gốc và ASTRA VER2 (số liệu không đổi — 205 nhân viên, 180 target gap, 79 initiative — fix chỉ thay đổi THỨ TỰ các mục hoà điểm trong F-01, không đổi nội dung).

**(b) Comma-split không tôn trọng dấu ngoặc → sinh skill rác trong dữ liệu thật. ✅ ĐÃ FIX (2026-06-20).**
`normalize_skill_list()` (`src/data_pipeline/skill_taxonomy.py`) split bằng regex `[;,]`. DS01 EMP-100 có ô thật `"DevOps (AWS, Terraform, K8s); API Testing, Performance Testing"` — dấu phẩy trong ngoặc bị cắt giữa câu, ra token rác `"DevOps (AWS"` và `"K8s)"` không khớp `SKILL_MAP`.
**Fix đã áp dụng**: hàm mới `_expand_paren_groups()` chạy trước bước split — chỉ "nổ" `Label (a, b, c)` thành `Label;a;b;c` khi trong ngoặc có dấu phẩy/chấm phẩy (tổng quát, không special-case từng dòng CSV); các trường hợp ngoặc không có dấu phẩy bên trong (`"Version Control (Git)"`, `"Security (OWASP)"`, `"Multi-cloud (AWS/Azure/GCP)"`) giữ nguyên y như cũ — đã test riêng để chắc không regression. Kết quả thật: EMP-100 giờ được tính đúng vào nhóm Kubernetes (`target_employee_count` Kubernetes 12→13 trong `priority_result.json`), đếm DevOps/AWS trong F-01 tăng đúng 1 — đây là SỬA SỐ LIỆU THẬT, không chỉ dọn rác.

**(c) Trích skill từ free-text bằng substring không có word-boundary → false positive. ✅ ĐÃ FIX (2026-06-20).**
`SKILL_KEYWORDS` check bằng `keyword in low` (substring thuần). Keyword `"rag"` (cho `LLM/GenAI`) match nhầm câu chứa `"storage"`/`"average"` (chứa substring "rag"); tương tự `"aws"` (3 ký tự) có thể match nhầm trong "draws", "laws", "jaws".
**Fix đã áp dụng**: `_keyword_pattern()` — keyword ≤5 ký tự (aws, rag, llm, gcp, iac, cka, pmp, agile, azure, ci/cd, cloud, genai, istqb, mlops, react — 15 keyword, liệt kê đầy đủ trong code) dùng regex `\bkeyword\b`; keyword dài hơn (phrase nhiều từ) GIỮ substring thuần có chủ đích — đây là cái cho phép `"microservice"` vẫn bắt được `"microservices"` (số nhiều) mà không phải liệt kê từng biến thể. Ngưỡng theo độ dài, không special-case theo từng keyword. Verify: `extract_skills_with_evidence("Improve average latency and storage layer")` → `[]` (trước fix: false positive LLM/GenAI); `extract_skills_with_evidence("Build a RAG pipeline")` → đúng bắt LLM/GenAI; `extract_skills_with_evidence("Migrate to microservices architecture")` → vẫn bắt đúng Microservices (không regression).

**Verify tổng thể sau cả 3 fix**: `pytest tests/data_pipeline/ -q` → 51/51 pass (cả ASTRA gốc và ASTRA VER2); 3 lần `run_pipeline.py --today 2026-06-18` liên tiếp ra **y hệt** (chỉ khác `generated_at`); đã regenerate + sync lại 4 JSON ở cả 2 repo. `priority_result.json` (file Agent 1 loop chính) giờ có 1 thay đổi số liệu thật (Kubernetes target_employee_count 12→13, do fix (b)) — Agent 1/Agent 2 nếu đã cache số cũ cần đọc lại file.

---

## 8. Đối chiếu feedback BGK (KADA_LnD6, vòng proposal) — phần thuộc trách nhiệm data layer

> 4 file `KADA_LnD6_Feedback_*.csv` chấm **bản proposal** (trước khi data layer này được code thật). Hầu hết feedback nói về thiết kế Agent 1/Agent 2 (HITL, memory, flow diagram) — **ngoài phạm vi Người 1**, không note ở đây. Chỉ liệt kê các điểm BGK chê liên quan trực tiếp tới xử lý data, và trạng thái thật của code hiện tại so với điểm đó.

| BGK | Feedback (tóm tắt) | Trạng thái thật trong code |
|---|---|---|
| Canh Ta (I.3, II.1) | "Phát hiện gap không nêu phương pháp hay ngưỡng"; "weighted prioritization không nêu rule" | ✅ Đã có từ lâu, KHÔNG phải fix mới: `gap_analyzer.py` tách rõ 4 field (`declared_gap`/`computed_gap`/`confirmed_gap`/`target_skills`) theo rule tường minh ở docstring; `prioritizer.py` có công thức cứng `bod(50)+project(30)+urgency(10)+survey(max10)+bod_weight(max10)` + ngưỡng P1≥70/P2 40-69/P3<40 + tie-break 4 cấp, đều in ra `score_breakdown` để audit. Feedback này chấm bản proposal (lúc đó chỉ là lời hứa); code thật đã trả lời được.|
| Canh Ta (Key Weakness 1) | "Xử lý khi nguồn dữ liệu mâu thuẫn nhau mới ở mức tuyên bố, chưa có cơ chế" | ✅ Đã có: `normalizer.py` `resolve_latest_survey_per_employee` (FIX #5) — DS03 có 2 đợt khảo sát mâu thuẫn (2025_Q4 vs 2026_Q1), code giữ đợt mới nhất làm signal chính, đợt cũ lưu lại ở `_superseded_surveys` để audit. Không còn là tuyên bố suông.|
| Canh Ta (II.3) | "Bước chuẩn hoá tên kỹ năng không xuất hiện trong bảng Agent Flow" | ⚠️ Không thuộc data layer — đây là thiếu sót ở **diagram/flow doc** (bên Agent 1/2), không phải code data. Bản thân bước chuẩn hoá có thật và đã document ở §1 bước 2 của handoff này; người vẽ flow cần thêm 1 node "normalize skill" trước bước nhận `priority_result.json`.|
| Nhung Nguyen — Business (I.3, Key Weakness 2) | "Chưa phát hiện edge case: xung đột trainer availability vs project deadline, hoặc khi BOD goals đổi giữa chừng" | ❌ Thật sự chưa làm, và **không thể làm bằng dữ liệu thật hiện có**: DS04 không có `booked_projects` (đã ghi rõ ở §5 handoff này), DS05 chỉ là 1 snapshot, không có lịch sử goal thay đổi theo thời gian để dựng cơ chế phát hiện "đổi giữa chừng". Đây là giới hạn dữ liệu nguồn, không phải lỗ hổng xử lý — đã note sẵn ở §5, Agent 1 phải tự giả định.|
| Huy Ha / Nhung Nguyen — Technical | "Over-engineering cho POC 2 tuần", "thành phần kỹ thuật ràng buộc quá mức" | ✅ Đã áp dụng khi sửa (b)/(c) ở §7 (2026-06-20): cả 2 fix dùng quy tắc tổng quát theo điều kiện (chỉ "nổ" ngoặc khi có dấu phẩy bên trong; chỉ thêm word-boundary cho keyword ≤5 ký tự) — KHÔNG special-case từng dòng CSV, KHÔNG thêm thư viện/NLP tokenizer. Đúng tinh thần "đơn giản nhưng hiệu quả" mà BGK đánh giá cao ở Constraint Awareness (Canh Ta 5/5).|

**Kết luận phần data layer:** Tính đến 2026-06-20, **toàn bộ điểm BGK chê liên quan trực tiếp tới data layer (vòng proposal) đã được giải quyết bởi code thật**, trừ 1 điểm không thể giải bằng dữ liệu hiện có:
- "Method/threshold rõ ràng" (Canh Ta) → ✅ đã có sẵn từ formula/threshold tường minh trong `prioritizer.py`.
- "Xử lý dữ liệu mâu thuẫn chỉ ở mức tuyên bố" (Canh Ta) → ✅ đã có sẵn từ `resolve_latest_survey_per_employee`.
- "Over-engineering risk" (Huy Ha/Nhung) → ✅ tự kiểm chứng khi vừa fix (b)/(c) — đã chọn cách tối giản, không phình thêm cơ chế.
- "Node chuẩn hoá thiếu trong flow diagram" (Canh Ta) → ⚠️ không sửa được từ phía data layer, cần báo người vẽ flow Agent 1/2.
- "Edge case trainer-deadline / BOD goal đổi giữa chừng" (Nhung Nguyen — Business) → ❌ vẫn mở, **không phải lỗi xử lý** mà là giới hạn của 5 CSV gốc (DS04 không có `booked_projects`, DS05 chỉ 1 snapshot không có lịch sử) — đã ghi rõ ở §5, Agent 1 phải tự giả định, Người 1 không tự bịa data được.

Nói cách khác: trong phạm vi Người 1 (data), chỉ còn đúng 1 mục treo và nó nằm ngoài khả năng giải quyết bằng code (thiếu nguồn dữ liệu), không phải nợ kỹ thuật.

*Handoff v2 — data layer realdata 2.0. Liên hệ Người 1 nếu cần thêm field.*
