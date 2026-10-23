# 📄 UAT Scripts Report

---

## 📄 Document Metadata
| Property | Details |
|----------|---------|
| **Date Generated** | [YYYY-MM-DD] |
| **Target Requirements** | [e.g., Requirement_Name.md] |
| **Analyzed By** | UAT Script Generator Skill (v3.0.0) |
| **Total UAT Scripts** | [X] |
| **Go-Live Readiness** | [✅ Ready / ⚠ Conditional / ❌ Not Ready] |

---

## 📊 1. Executive Summary

| Metric | Count |
|--------|-------|
| **Total Business Flows** | [X] |
| **Total UAT Scripts** | [X] |
| **Critical Scripts (P0)** | [X] |
| **High Priority Scripts (P1)** | [X] |
| **Business Coverage** | [XX]% |

---

> **Schema Reference:** `schemas/uat_script.schema.md`

## 📋 2. UAT Scripts

*(For each script, repeat the block below)*

### 📌 [UAT-MODULE-001]: [Business Process / Journey Name]

| Attribute | Value |
|-----------|-------|
| **Requirement** | [REQ-XX] |
| **Business Process** | [e.g., Customer Login] |
| **User Role** | [e.g., Customer, Admin] |
| **Priority** | [P0 / P1 / P2 / P3] |

**Objective:**
> [What this UAT script validates from a business perspective]

**Preconditions:**
- [Required system/business state]

**Test Data:**

| Field | Value |
|-------|-------|
| Username | user01 |
| Password | Password123 |

**Business Steps:**

| Step | Action |
|------|--------|
| 1 | Open Login Page |
| 2 | Enter Username |
| 3 | Enter Password |
| 4 | Click Login |

**Expected Business Outcome:**
- [Observable business result 1]
- [Observable business result 2]

**Acceptance Criteria:**
- [Business acceptance criterion 1]
- [Business acceptance criterion 2]

**Execution Status:** Pass / Fail / Blocked

**Tester Comment:**
_________________________

---

## 🔗 3. UAT Traceability Matrix

| UAT ID | Requirement | Business Rule | Priority |
|--------|-------------|---------------|----------|
| UAT-001 | REQ-01 | BR-01 | P0 |

---

## 📊 4. Business Coverage Summary

| Business Flow | Covered | Status |
|---------------|---------|--------|
| Login | Yes | Complete |
| Checkout | Yes | Complete |
| Refund | No | Missing |

---

## 🚨 5. High-Risk UAT Scripts

| UAT ID | Business Risk | Priority |
|--------|---------------|----------|
| UAT-008 | Duplicate Payment | P0 |
| UAT-010 | Refund Validation | P0 |

---

## 💡 6. Final Recommendations

Identify:

- Missing UAT coverage
- Missing Business Flows
- High-risk Business Processes
- Suggested Business Users for execution
- Go-Live readiness assessment

---
# End of Report
