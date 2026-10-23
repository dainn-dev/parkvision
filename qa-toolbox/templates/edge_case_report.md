# 🧨 Edge Case & System Risk Report

---

## 📄 Document Metadata
| Property | Details |
|----------|---------|
| **Date Generated** | [YYYY-MM-DD] |
| **Target Requirements** | [e.g., Requirement_Name.md] |
| **Analyzed By** | Edge Case Discovery Skill (v3.0.0) |
| **System Risk Level** | [🟢 Low / 🟡 Medium / 🟠 High / 🔴 Critical] |

---

## 📊 1. Executive Summary

| Risk Category | Count | Critical 🔴 | High 🟠 | Medium 🟡 | Low 🟢 |
|---------------|-------|------------|--------|----------|-------|
| **State Interruption** | [X] | [X] | [X] | [X] | [X] |
| **Concurrency / Race** | [X] | [X] | [X] | [X] | [X] |
| **Data Extremes** | [X] | [X] | [X] | [X] | [X] |
| **Time Boundaries** | [X] | [X] | [X] | [X] | [X] |
| **Logic Stress** | [X] | [X] | [X] | [X] | [X] |

---

## 🚨 2. Critical Failure Modes
*(List scenarios that can cause data loss, corruption, or financial impact)*
- 🔴 **[Failure Mode 1]**: [Brief explanation]
- 🔴 **[Failure Mode 2]**: [Brief explanation]

> **Schema Reference:** `schemas/finding.schema.md`

## 🧨 3. Edge Case Matrix

*(For each edge case, repeat the block below)*

### 📌 [EDGE-MODULE-001]: [Short Scenario Title]
- **Category**: [State Interruption / Concurrency & Race / Data Extreme / Time Boundary / Logic Stress]
- **Severity**: 🔴 Critical (P0) / 🟠 High (P1) / 🟡 Medium (P2) / 🟢 Low (P3)
- **Status**: Open / Pending Verification / Confirmed
- **Req Traceability**: [FR-XXX-YY]

**🔍 Scenario Description:**
> [Describe the exact adversarial action or system state]

**❌ Expected Failure / Risk:**
[What happens if the system does not handle this? Data loss? Duplicate charge?]

**💡 Recommendation (Backend/UI):**
[Suggest idempotency key, DB lock, UI debounce, etc.]

**🧪 Automation Candidate:** [Yes/No - API Test / UI Test]

---

## 🛡️ 4. Attack Surface Analysis
- **Entry points of failure**: [List vulnerabilities]
- **Missing safeguards**: [e.g., No idempotency checks on Payment API]

---
# End of Report
