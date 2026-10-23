# 🌐 Global Rules

> Applies to: ALL Agents

---

## 1. Zero Hallucination Policy
- NEVER invent or assume requirements that do not exist in the source documents.
- NEVER fabricate evidence, quotes, or document references.
- If information is missing, explicitly report it as **[MISSING]**. Do not attempt to fill in the blanks using industry standards unless specifically advising as a recommendation.

## 2. Evidence-Based Reasoning
- Every finding MUST reference the source document and section.
- Every finding MUST include a direct quote from the text.
- If a feature is missing, state exactly which document and section was searched.

## 3. Severity & Priority Definitions
When classifying findings or gaps, use the following scale:

- 🔴 **Critical (P0)**: System cannot function, blocks core business flow, or causes severe data corruption/security breach. Must be fixed immediately.
- 🟠 **High (P1)**: Major feature failure with no workaround. High business impact.
- 🟡 **Medium (P2)**: Non-critical feature failure, edge case defect, or has a viable workaround.
- 🟢 **Low (P3)**: Minor UI/UX issue, typo, or slight ambiguity that does not block development.

## 4. Output Formatting
- Always output valid Markdown.
- Use tables for structured data (Coverage matrix, Test case steps).
- Use blockquotes (`>`) for evidence text.

## 5. Terminology Consistency
- Use consistent terminology throughout all reports.
- Standardized terms:
  - **Requirement** (not "spec", "feature request", or "item")
  - **Test Case** (not "test", "check", or "validation")
  - **Test Scenario** (not "test story" or "use case")
  - **Edge Case** (not "corner case" or "exception")
  - **Finding** (not "issue", "defect", or "bug" — unless confirmed as a defect)
  - **Gap** (not "hole", "miss", or "omission")
- When referencing document names, use the exact filename as it appears in `docs/`.

## 6. Output Language Standard
- AI must strictly adhere to the language governance defined in `.agents/AGENTS.md` (`<RULE[qa_deliverables_language_standard]>`):
  - **Communication & QA Analysis Reports**: MUST be written in **Tiếng Việt** (Vietnamese), including `Req_Gap_Report.md`, `Logic_Anomaly_Report.md`, `Risk_Analysis_Report.md`, `Edge_Case_Report.md`, `Test_Scenarios_Report.md`, `Coverage_Report.md`, and `Executive_Summary.md`. Section headings, technical explanations, applied techniques, and self-review audits inside `Testcases.md` also MUST be in Vietnamese.
  - **Test Case Table Content (14 Columns)**: All natural-language content inside the 14-column Test Case table MUST be in **English** (Description, Pre-Requisite, Steps Description, Test Data, Expected Result, Remarks). Action verbs must be in English.
  - **14-Column Headers & Standardized Identifiers**: Column headers, TC IDs, FR/BR IDs, HTTP/API codes, Priority/Severity values, and governance tags MUST remain in English and MUST NOT be translated or renamed.
  - **Source-Defined Text Preservation**: Exact source-defined UI labels, error messages, and business values must be preserved as defined in the source document.

## 7. Report Versioning
- Every generated report MUST include a `Document Metadata` section with the generation date.
- When regenerating a report for the same requirement document, the new report **completely replaces** the previous version (overwrite, not append).
- Do NOT maintain version history within the report itself. The Git history serves as the version control mechanism.

## 8. Report Naming Convention
- ALL generated reports MUST be named using the following dynamic format: `[Requirement_Name]_[Report_Type].md`.
- Example: If the analyzed requirement file is `Host_Listing_Management.md` and the report is a Gap Report, the output file MUST be `Host_Listing_Management_Gap_Report.md`.
- Do NOT use generic filenames like `report.md`, `test_scenarios.md`, or `gap_analysis.md`.

## 9. Requirement Clarity Gate (Global)
- Before ANY analysis or generation, ALL agents MUST assess the clarity of the provided requirement.
- If the requirement contains **Critical-level ambiguities** that would cause fundamentally unreliable output:
  - **PAUSE** execution immediately.
  - Output a list of **Clarification Questions** for the user.
  - Output a list of **Generation Blockers / Hallucination Risks** associated with proceeding.
  - Wait for user clarification before resuming.
- Minor ambiguities (Medium/Low severity) may be noted as findings and processing may continue.
- This rule applies to ALL agents, not just the testcase_generator.

## 10. Zero Sample Testcases Policy (Mandatory Exhaustive Generation)
- NEVER generate sample, placeholder, or truncated demo test cases.
- For every target module or requirement section, the AI MUST perform atomic requirement decomposition and generate 100% complete, exhaustive test cases covering Happy Path, Negative, Boundary Value Analysis, Equivalence Partitioning, State Transitions, Security, Performance, UI/UX, and Exception Fallbacks.
- ALL test suites MUST be output simultaneously in both Markdown (`.md`) and CSV (`.csv`) formats.

## 11. Schema & Contract Compliance (Global Standard)
- All analytical and generated outputs MUST strictly comply with the master contracts in `schemas/`:
  - **Findings (Gap, Logic Anomaly, Edge Case, Risk, Design)**: Must comply with `schemas/finding.schema.md` (Format: `[TYPE]-[MODULE]-[NNN]`).
  - **Manual Test Cases**: Must comply with `schemas/testcase.schema.md` (Exact 14 columns, action verbs, `<br>` line breaks, TC_ID: `[MODULE]-TC-[NNN]`).
  - **UAT Acceptance Scripts**: Must comply with `schemas/uat_script.schema.md` (Format: `UAT-[MODULE]-[NNN]`, business language).
  - **Coverage Analysis**: Must comply with `schemas/coverage.schema.md` (4 Testability states, multi-dimensional matrix, 100% Quality Gate).
- **Single Source of Truth**: The Severity definitions in Section 3 serve as the authoritative standard across all templates and reports. Agents and templates must not invent separate severity criteria.
