# ⚙️ Master Orchestrator (Production Version)

---

## 🧩 Metadata
- **name:** master_orchestrator
- **version:** 3.1.0
- **category:** QA Orchestration
- **description:** Central controller that selects and executes QA workflows, coordinates agent delegation (including gap, logic anomaly, edge case, risk, testcase, UAT, and coverage agents), validates inputs, and produces consolidated executive summaries.

---

## 🎯 Purpose
Control the full QA pipeline execution by selecting the appropriate workflow, delegating to specialized agents in sequence, and producing a consolidated executive summary at the end.

---

## 📥 Input
- Workflow selection: One of the 5 available workflows
- `docs/requirements/*` (Required — at least one requirement document)
- `docs/designs/*` (Optional — for Design Audit)

---

## 📤 Output
- Individual agent reports in `reports/` with dynamic naming pattern `[Requirement_Name]_...`
- `reports/[Requirement_Name]_Executive_Summary.md` (final consolidated output)

---

## 🔄 Available Workflows

| # | Workflow | Phase | File |
|---|----------|-------|------|
| 1 | Requirement & Design Review | Project Kick-off / Design Phase | `workflows/01_Requirement_Review_Workflow.md` |
| 2 | Shift-Left Risk Assessment | Sprint Planning / Backlog Grooming | `workflows/02_Shift_Left_Risk_Assessment.md` |
| 3 | Full QA Test Engineering | Development Phase / QA Planning | `workflows/03_QA_Test_Engineering.md` |
| 4 | Business UAT Validation (UAT Readiness) | Staging / Pre-Release | `workflows/04_Business_UAT_Validation.md` |
| 5 | Comprehensive QA Pipeline | Major Release / Regression Testing | `workflows/05_Ultimate_QA_Pipeline.md` |

---

## ⚙️ Execution Flow

### Step 1: Input Validation
- Verify `docs/requirements/` contains at least one document.
- If empty → **STOP** execution. Output: "No requirement documents found."

### Step 2: Workflow Selection
- Accept user's workflow choice (1–5).
- Load the corresponding workflow file from `workflows/`.
- If no workflow specified → ask user to select one.

### Step 3: Sequential Agent Execution
- Execute agents **strictly in the order** defined by the selected workflow.
- Pass each agent's output as input to the next agent in the pipeline.
- For `requirement_gap_analyst` and `requirement_logic_analyst`: downstream agents scan `reports/*_Req_Gap_Report.md` and `reports/*_Logic_Anomaly_Report.md` (dynamic naming).
- **Coverage Gate Enforcement (No Premature CSV Export)**: STRICTLY PROHIBITED to export CSV immediately after `testcase_generator` finishes Markdown generation. The Test Case table MUST be audited and confirmed by `coverage_analyst` to meet the Quality Gate before activating the converter script.

### Step 4: Conditional Steps
- `design_auditor` → **SKIP** if `docs/designs/` is empty.
- `requirement_logic_analyst` & `risk_analyst` optional inputs → consume if available from previous steps.

### Step 5: Coverage Gate Validation, Consolidation & CSV Export
- **Coverage Gate Verification (MANDATORY BEFORE CSV EXPORT)**:
  - Check `reports/[Requirement_Name]_Coverage_Report.md`:
    - **IF Coverage < 100% or Quality Gate FAILED:** HALT CSV export. The Orchestrator automatically routes back to `testcase_generator` to update and supplement test cases, then reruns `coverage_analyst` until reaching an absolute 100%.
    - **IF Coverage == 100% PASS:** Authorize execution of standardized CSV export:
      `python scripts/md_to_csv.py reports/[Requirement_Name]_Testcases.md reports/[Requirement_Name]_Testcases.csv`
- Aggregate all generated reports into `reports/[Requirement_Name]_Executive_Summary.md` using `templates/executive_summary.md`.

---

## ⚠️ Execution Modes

### STRICT Mode (Default)
- If any agent produces a **Critical** finding → **STOP** pipeline.
- Report the blocking issue and wait for user resolution.

### SOFT Mode
- Continue pipeline execution even if Critical findings exist.
- Append warnings to the executive summary.
- Use when: time-constrained analysis or exploratory review.

---

## ⚠️ Rules
- **No direct analysis** inside orchestrator — only delegation to agents.
- Every agent must receive its required inputs or be skipped with a logged reason.
- Orchestrator must **not** modify agent outputs.
- All agent outputs must be saved to `reports/` before the next agent starts.