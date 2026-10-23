# 🧠 Requirement & Traceability Gap Report

---

## 📄 Document Metadata
| Property | Details |
|----------|---------|
| **Date Generated** | [YYYY-MM-DD] |
| **Target Requirements** | [e.g., Requirement_Name.md] |
| **Analyzed By** | Requirement & Gap Analyst (v3.0.0) |
| **Requirement Quality Score** | **[XX]%** |
| **Overall Health** | [🟢 Healthy / 🟡 Needs Revision / 🔴 High Risk] |

---

## 📊 1. Executive Summary

| Severity / Type | Critical 🔴 | High 🟠 | Medium 🟡 | Low 🟢 |
|-----------------|------------|--------|----------|-------|
| **Traceability Gaps (Cross-Doc)** | [X] | [X] | [X] | [X] |
| **Logic Defects (Internal)** | [X] | [X] | [X] | [X] |

---

> **Schema Reference:** `schemas/finding.schema.md`

## 🚨 2. Traceability Gaps (Cross-Document)
*(Missing, Orphan, Partial Coverage across PRD vs SRS)*

*(For each gap, repeat the block below)*

### 📌 [GAP-MODULE-001]: [Short Issue Title]
- **Type**: Missing Rule / Traceability Gap / Inconsistency
- **Severity**: 🔴 Critical (P0) / 🟠 High (P1) / 🟡 Medium (P2) / 🟢 Low (P3)
- **Status**: Pending Verification / Confirmed / Open
- **Docs Involved**: [Source Doc] vs [Target Doc]
- **Location**: [Source Section] vs [Target Section]

**🔍 Evidence (Source vs Target):**
> Source: "[Direct quote from source document]"
> Target: "[Quote from target document OR 'NOT FOUND in {doc}']"

**⚠️ Impact:**
[Explain the business, technical, or testing impact if this gap is unaddressed]

**💡 Recommendation:**
[Suggest clear resolution for BA/PO. Do NOT invent business rules without source evidence]

---

## 🚨 3. Requirement Quality Defects (Internal)
*(Ambiguity, Missing Business Rules, Missing Edge Cases, Contradictions)*

*(For each defect, repeat the block below)*

### 📌 [GAP-MODULE-002]: [Short Issue Title]
- **Type**: Ambiguity / Missing Rule / Contradiction / Edge Case
- **Severity**: 🔴 Critical (P0) / 🟠 High (P1) / 🟡 Medium (P2) / 🟢 Low (P3)
- **Status**: Pending Verification / Confirmed / Open
- **Location**: [Doc Name] > [Section / Lines]

**🔍 Evidence:**
> "[Direct quote from document]"

**⚠️ Impact:**
[Explain why this defect blocks design, development, or test generation]

**💡 Recommendation:**
[Concrete resolution or clarification questions for BA/PO]

---

## 🗺️ 4. Missing Requirement Map
| Category | Missing Items |
|----------|---------------|
| **Missing Flows** | - [e.g., Password Reset Flow] |
| **Missing Rules** | - [e.g., Role-based access] |
| **Missing Edge Cases**| - [e.g., Handling emoji inputs] |

---

## ✅ 5. Action Items (Prioritized)
| Priority | Action Required |
|----------|-----------------|
| **P0** | [Fix critical gaps/flows] |
| **P1** | [Clarify ambiguous rules] |
| **P2** | [Add edge cases] |

---
# End of Report
