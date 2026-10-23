# 📐 Master Coverage Schema (v1.0.0)
> **Status:** Active Standard | **Applicable to:** `coverage_analyst`, `templates/coverage_report.md`, `master_orchestrator`

---

## 1. 🎯 Purpose & Measurement Standards
This schema defines the multi-dimensional test coverage measurement structure for the framework.

Core Principle: **Never measure coverage superficially by high-level feature names.** All calculations MUST be based on decomposing requirements into **atomic conditions** and cross-referencing multi-dimensionally against Scenarios, Edge Cases, and Risk items.

---

## 2. 🚦 4 Testability States & Calculation Formulas

Per `<RULE[requirement_testability_and_coverage_status]>` in `.agents/AGENTS.md`:

| Testability State | Technical Definition | Coverage Denominator Calculation | Action Protocol |
|---|---|:---:|---|
| 🟢 **`TESTABLE`** | Has clear Acceptance Criteria, branching logic, and deterministic Pass/Fail Oracle. | **Counted in Functional Coverage** (100% when all Atomic Conditions have test cases). | Generate comprehensive test cases across all dimensions (Positive, Negative, Boundary). |
| 🟡 **`PARTIALLY TESTABLE`** | Part of requirement is clear, part lacks formulas or remains qualitative. | **Coverage = X/Y Conditions** (e.g., 2/4 conditions = 50% Coverage). | Flag as `PARTIAL / Pending Clarification`. Cannot be counted as Fully Covered. |
| 🔵 **`NEEDS VERIFICATION`** | Theoretically testable but lacks System Design / API Contract / Technical Evidence. | **Excluded from Functional Coverage** until official technical evidence is provided. | Record in Gap Report: `[Verification Request — Pending response from: System Design / BA / Dev]`. |
| 🔴 **`NOT TESTABLE`** | Lacks objective criteria to determine Pass/Fail (entirely subjective/qualitative). | **Excluded from denominator** (`Coverage = N/A`). | Do not generate speculative test cases. Transfer 100% to Requirement Gap Report. |

---

## 3. 📊 Multi-Dimensional Coverage Matrix

A valid Coverage Report MUST encompass all 4 measurement dimensions:

### 1. Dimension 1: Functional Requirement Coverage (Atomic Level)
$$\text{Functional Coverage (\%)} = \frac{\sum \text{Testable Atomic Conditions Covered}}{\sum \text{Total Testable Atomic Conditions}} \times 100\%$$
- **Mandatory Threshold (Quality Gate):** MUST reach an **absolute 100%** before the pipeline can activate the CSV export step. If $< 100\%$, the pipeline automatically loops back to `testcase_generator` to generate missing cases.

### 2. Dimension 2: Scenario Coverage
- Ratio of scenarios in `*_Test_Scenarios_Report.md` converted into at least one concrete Manual Test Case.
- **Target:** $\ge 95\%$.

### 3. Dimension 3: Edge Case Coverage
- Ratio of extreme boundary test cases in `*_Edge_Case_Report.md` mapped to corresponding Test Cases.
- **Target:** $100\%$ for P0 and P1 cases.

### 4. Dimension 4: Risk Mitigation Coverage
- Ratio of risks in `*_Risk_Analysis_Report.md` covered by preventive test scenarios.
- **Target:** $100\%$ for Critical (P0) and High (P1) risks.

---

## 4. 📋 Coverage Report Table Specifications

### A. Requirement Coverage Table:
```markdown
| Atomic ID | Sub-Requirement Name | Testability State | Test Case Mappings | Coverage Status | Notes |
|---|---|:---:|---|:---:|---|
| `FR-RID-7.1` | Destination change activation condition | 🟢 TESTABLE | `RID-TC-001`, `RID-TC-002` | 100% | Covered In Trip vs En Route |
| `FR-RID-7.5` | Proximity Lock distance threshold | 🟢 TESTABLE | `RID-TC-039`, `RID-TC-040` | 100% | BVA 499m vs 500m, 59s vs 60s |
| `FR-RID-7.8` | Fare Delta calculation from Original Pickup | 🟢 TESTABLE | `RID-TC-016`, `RID-TC-017` | 100% | Verified formula from original pickup |
| `FR-RID-7.X` | Routing Engine response latency | 🔵 NEEDS VERIFICATION | N/A | 0% | [SLA: TBD] — Pending API Contract |
```

### B. Cross-Artifact Traceability Matrix:
```markdown
| Finding Source | Item ID | Severity | Mapped Test Case(s) | Mitigation Status |
|---|---|:---:|---|:---:|
| Risk Report | `RISK-RID-001` | 🔴 Critical | `RID-TC-016`, `RID-TC-017` | ✅ Mitigated |
| Risk Report | `RISK-RID-002` | 🔴 Critical | `RID-TC-026`, `RID-TC-027` | ✅ Mitigated |
| Edge Case Report | `EDGE-RID-001` | 🟠 High | `RID-TC-056` | ✅ Mitigated |
| Edge Case Report | `BVA-RID-005` | 🟠 High | `RID-TC-034` | ✅ Mitigated |
```

---

## 5. 🛑 Anti-Coverage-Shortcut Rules
1. **No Sample Representatives:** Strictly prohibited to generate 1 representative test case and state *"Other cases tested similarly"*. Every Atomic Condition must have at least one explicit test case.
2. **No False Rounding:** States `NEEDS VERIFICATION` or `PARTIALLY TESTABLE` MUST NEVER be rounded up to 100% in summary reports presented to PM/PO.
